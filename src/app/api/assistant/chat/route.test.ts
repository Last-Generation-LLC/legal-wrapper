import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Document } from "@prisma/client";
import { simulateReadableStream } from "ai";
import { MockLanguageModelV3 } from "ai/test";
import { FOOTER_OPEN, FOOTER_CLOSE } from "@/lib/contract";

// Mock the Prisma singleton (established pattern — see documents.test.ts).
vi.mock("@/lib/prisma", () => ({
  prisma: { document: { findMany: vi.fn() } },
}));

// Mock the model seam so the route runs against a scripted model, no network.
vi.mock("@/lib/anthropic", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/anthropic")>();
  return { ...original, languageModelFor: vi.fn() };
});

import { prisma } from "@/lib/prisma";
import { languageModelFor } from "@/lib/anthropic";
import { POST } from "./route";

// --- helpers ---------------------------------------------------------------

const DOC: Document = {
  id: "doc1",
  filename: "msa.pdf",
  title: null,
  mimeType: "application/pdf",
  extractedText:
    "The term of this Agreement is five (5) years from the Effective Date.",
  tokenCount: 20,
  tokenCountEstimated: false,
  createdAt: new Date(),
};

/** A minimal valid UIMessage history: one user turn. */
const MESSAGES = [
  {
    id: "m1",
    role: "user",
    parts: [{ type: "text", text: "What is the term?" }],
  },
];

function validBody(overrides: Record<string, unknown> = {}) {
  return {
    docIds: ["doc1"],
    systemPromptTemplate: "You are helpful.\n{{DOCUMENTS}}",
    messages: MESSAGES,
    ...overrides,
  };
}

function request(body: unknown): Request {
  return new Request("http://test/api/assistant/chat", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

/** Script the mocked model to stream the given text in two deltas. */
function scriptModel(fullText: string) {
  const mid = Math.floor(fullText.length / 2);
  vi.mocked(languageModelFor).mockReturnValue(
    new MockLanguageModelV3({
      doStream: async () => ({
        stream: simulateReadableStream({
          chunks: [
            { type: "text-start", id: "t1" },
            { type: "text-delta", id: "t1", delta: fullText.slice(0, mid) },
            { type: "text-delta", id: "t1", delta: fullText.slice(mid) },
            { type: "text-end", id: "t1" },
            {
              type: "finish",
              finishReason: { unified: "stop", raw: undefined },
              usage: {
                inputTokens: {
                  total: 10,
                  noCache: 10,
                  cacheRead: undefined,
                  cacheWrite: undefined,
                },
                outputTokens: { total: 20, text: 20, reasoning: undefined },
              },
            },
          ],
        }),
      }),
    }) as unknown as ReturnType<typeof languageModelFor>,
  );
}

// --- tests -------------------------------------------------------------------

describe("POST /api/assistant/chat — rejections", () => {
  beforeEach(() => vi.clearAllMocks());

  it("400 on a non-JSON body", async () => {
    const res = await POST(request("not json {"));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/JSON/);
  });

  it("400 when docIds / systemPromptTemplate / messages are malformed", async () => {
    const res = await POST(
      request({ docIds: "doc1", systemPromptTemplate: "", messages: [] }),
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBeTruthy();
  });

  it("400 when messages is not a valid UIMessage array", async () => {
    const res = await POST(request(validBody({ messages: [{ bogus: true }] })));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/message/i);
  });

  it("404 with the missing ids when a docId is unknown", async () => {
    vi.mocked(prisma.document.findMany).mockResolvedValue([]);
    const res = await POST(request(validBody({ docIds: ["nope"] })));
    expect(res.status).toBe(404);
    expect((await res.json()).error).toContain("nope");
  });
});

describe("POST /api/assistant/chat — streaming", () => {
  beforeEach(() => vi.clearAllMocks());

  it("streams the prose and attaches verified citations as a data part", async () => {
    vi.mocked(prisma.document.findMany).mockResolvedValue([DOC]);
    const footer = JSON.stringify({
      citations: [
        // verbatim substring of DOC.extractedText, >= 12 chars
        {
          docId: "doc1",
          quote: "term of this Agreement is five (5) years",
          section: "§1",
        },
      ],
      confidence: 0.9,
    });
    scriptModel(
      `The term is five years.\n${FOOTER_OPEN}\n${footer}\n${FOOTER_CLOSE}`,
    );

    const res = await POST(request(validBody()));
    expect(res.status).toBe(200);
    const sse = await res.text();

    // prose streamed through
    expect(sse).toContain("The term is five years.");
    // the verified-citations data part rode the same stream, carrying the
    // FULL VerifiedAnswer: footer-stripped prose value + flagged citations
    // + (possibly downgraded) confidence
    expect(sse).toContain("data-citations");
    expect(sse).toContain('"value":"The term is five years."');
    expect(sse).toContain('"verified":true');
    expect(sse).toContain('"confidence":0.9');
  });

  it("degrades to prose-only when the footer is absent (no data part, no error)", async () => {
    vi.mocked(prisma.document.findMany).mockResolvedValue([DOC]);
    scriptModel("The term is five years. No footer here.");

    const res = await POST(request(validBody()));
    expect(res.status).toBe(200);
    const sse = await res.text();
    expect(sse).toContain("No footer here.");
    expect(sse).not.toContain("data-citations");
  });

  it("caps confidence at 0.3 when a quote fails verification", async () => {
    vi.mocked(prisma.document.findMany).mockResolvedValue([DOC]);
    const footer = JSON.stringify({
      citations: [
        { docId: "doc1", quote: "this text is not in the document" },
      ],
      confidence: 0.95,
    });
    scriptModel(`Answer.\n${FOOTER_OPEN}\n${footer}\n${FOOTER_CLOSE}`);

    const res = await POST(request(validBody()));
    const sse = await res.text();
    expect(sse).toContain('"verified":false');
    expect(sse).toContain('"confidence":0.3');
  });

  it("allows an empty docIds (chat without documents)", async () => {
    vi.mocked(prisma.document.findMany).mockResolvedValue([]);
    scriptModel("General answer, no documents attached.");

    const res = await POST(request(validBody({ docIds: [] })));
    expect(res.status).toBe(200);
    expect(await res.text()).toContain("General answer");
  });

  it("sends the composed system prompt: filled template then strategy block", async () => {
    vi.mocked(prisma.document.findMany).mockResolvedValue([DOC]);
    scriptModel("ok");

    const res = await POST(request(validBody()));
    // The stream executes lazily — consume it so the model call happens.
    await res.text();

    // The mocked model captured the call; the system prompt must contain the
    // rendered document block AND the citation strategy, in that order.
    const mock = vi.mocked(languageModelFor).mock.results[0]
      .value as MockLanguageModelV3;
    const call = mock.doStreamCalls[0];
    const systemText = JSON.stringify(call.prompt);
    expect(systemText).toContain("===== DOCUMENT: msa.pdf =====");
    expect(systemText).toContain("Citations and confidence");
    expect(systemText.indexOf("===== DOCUMENT")).toBeLessThan(
      systemText.indexOf("Citations and confidence"),
    );
  });
});
