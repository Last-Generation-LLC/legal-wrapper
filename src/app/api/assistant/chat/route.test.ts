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

// Mock persistence (#22) — assert the route's two writes without a DB.
vi.mock("@/lib/chat-store", () => ({
  getActiveSession: vi.fn().mockResolvedValue({ id: "session1" }),
  replaceThread: vi.fn().mockResolvedValue(undefined),
  appendMessage: vi.fn().mockResolvedValue(undefined),
}));

import { prisma } from "@/lib/prisma";
import { languageModelFor } from "@/lib/anthropic";
import { appendMessage, replaceThread } from "@/lib/chat-store";
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

/** Script the mocked model so doStream REJECTS with the given error. */
function scriptModelReject(err: Error) {
  vi.mocked(languageModelFor).mockReturnValue(
    new MockLanguageModelV3({
      doStream: async () => {
        throw err;
      },
    }) as unknown as ReturnType<typeof languageModelFor>,
  );
}

/** Script the mocked model to stream the given text in two deltas.
 *  The finish chunk includes providerMetadata with cacheCreationInputTokens
 *  and a cacheRead token count so the route's normalizeAssistantUsage can
 *  produce a canonical TokenUsage shape.
 *
 *  Simulated usage: total input = 10 (4 uncached + 3 cacheRead + 3 cacheWrite),
 *  outputTokens = 20. So canonical: uncached=4, cacheRead=3, cacheWrite=3, out=20.
 */
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
                  noCache: 4,
                  cacheRead: 3,
                  cacheWrite: 3,
                },
                outputTokens: { total: 20, text: 20, reasoning: undefined },
              },
              providerMetadata: { anthropic: { cacheCreationInputTokens: 3 } },
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

  it("413 BEFORE the model call when the combined selection is over the ceiling (#16)", async () => {
    vi.mocked(prisma.document.findMany).mockResolvedValue([
      { ...DOC, id: "a", tokenCount: 100_000 },
      { ...DOC, id: "b", tokenCount: 90_000 },
    ]);
    const res = await POST(request(validBody({ docIds: ["a", "b"] })));
    expect(res.status).toBe(413);
    expect((await res.json()).error).toMatch(/190\.0k.*180\.0k/);
    expect(languageModelFor).not.toHaveBeenCalled(); // blocked while a clean status is still possible
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

  it("attaches a timestamp and canonical token usage as message metadata", async () => {
    vi.mocked(prisma.document.findMany).mockResolvedValue([DOC]);
    scriptModel("The term is five years.");

    const res = await POST(request(validBody()));
    const sse = await res.text();

    // start event → createdAt; finish-step event → canonical usage derived from
    // the model's finish chunk (scriptModel: total=10, cacheRead=3, cacheWrite=3
    // → uncached=4, cacheRead=3, cacheWrite=3, out=20).
    expect(sse).toContain('"createdAt"');
    expect(sse).toContain('"usage"');
    expect(sse).toContain('"uncachedInputTokens":4');
    expect(sse).toContain('"outputTokens":20');
    expect(sse).toContain('"cacheReadInputTokens":3');
    expect(sse).toContain('"cacheWriteInputTokens":3');
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

  it("deduplicates repeated docIds instead of returning a false 404", async () => {
    vi.mocked(prisma.document.findMany).mockResolvedValue([DOC]);
    scriptModel("ok");

    const res = await POST(request(validBody({ docIds: ["doc1", "doc1"] })));
    expect(res.status).toBe(200);
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
    expect(systemText).toContain("===== DOCUMENT: msa.pdf (id: doc1) =====");
    // The doc's Prisma id must be visible to the model — citations name docs
    // by id, and verifyAnswer looks quotes up by that same id (bug B).
    expect(systemText).toContain("(id: doc1)");
    expect(systemText).toContain("Citations and confidence");
    expect(systemText.indexOf("===== DOCUMENT")).toBeLessThan(
      systemText.indexOf("Citations and confidence"),
    );
  });

  it("persists the incoming thread before the call and the finished turn after (#22)", async () => {
    vi.mocked(prisma.document.findMany).mockResolvedValue([DOC]);
    const text =
      "The term is five years." +
      `${FOOTER_OPEN}{"citations":[{"docId":"doc1","quote":"five (5) years from the"}],"confidence":0.9}${FOOTER_CLOSE}`;
    scriptModel(text);

    const res = await POST(request(validBody()));
    await res.text(); // drain the stream so the post-stream append runs

    // Write 1: replace-all of the client's array, with the doc selection.
    expect(replaceThread).toHaveBeenCalledWith("session1", MESSAGES, ["doc1"]);

    // Write 2: the finished assistant turn — raw text, verified citations
    // data part, and the same metadata shape the stream carried.
    expect(appendMessage).toHaveBeenCalledTimes(1);
    const [sessionId, message, position] = vi.mocked(appendMessage).mock.calls[0];
    expect(sessionId).toBe("session1");
    expect(position).toBe(MESSAGES.length);
    expect(message.role).toBe("assistant");
    const parts = message.parts as Array<{ type: string; [k: string]: unknown }>;
    expect(parts[0]).toEqual({ type: "text", text });
    expect(parts[1].type).toBe("data-citations");
    // Canonical usage shape derived from the mock finish chunk (total=10, cacheRead=3,
    // cacheWrite=3 → uncached=4, cacheRead=3, cacheWrite=3, out=20).
    expect(message.metadata).toMatchObject({
      usage: {
        uncachedInputTokens: 4,
        cacheReadInputTokens: 3,
        cacheWriteInputTokens: 3,
        outputTokens: 20,
      },
    });
  });

  it("does not persist an assistant turn when the stream fails (#22)", async () => {
    vi.mocked(prisma.document.findMany).mockResolvedValue([DOC]);
    scriptModelReject(new Error("boom"));

    const res = await POST(request(validBody()));
    await res.text();

    expect(replaceThread).toHaveBeenCalledTimes(1); // the user's turn is safe
    expect(appendMessage).not.toHaveBeenCalled(); // no half-finished reply
  });

  it("maps a context-ceiling doStream rejection to a legible SSE error, not raw internals", async () => {
    vi.mocked(prisma.document.findMany).mockResolvedValue([DOC]);
    scriptModelReject(
      new Error("prompt is too long: 250000 tokens > 200000 maximum"),
    );

    const res = await POST(request(validBody()));
    expect(res.status).toBe(200); // stream already opened; error rides SSE
    const sse = await res.text();

    // onError must have mapped the message to the human-readable ceiling text.
    expect(sse).toContain("exceed the model's context window");
    // Raw token counts from the original error must NOT leak to the client.
    expect(sse).not.toContain("250000");
  });
});
