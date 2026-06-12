import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Document } from "@prisma/client";
import Anthropic from "@anthropic-ai/sdk";
import { REVIEW_TOOL_NAME } from "@/lib/contract";
import { MODELS } from "@/lib/anthropic";

// Mock the Prisma singleton (established pattern — see documents.test.ts).
vi.mock("@/lib/prisma", () => ({
  prisma: { document: { findUnique: vi.fn() } },
}));

// Mock the RAW client path of the model seam — the review cell is single-shot
// non-streaming, so it goes through getAnthropic(), not the AI SDK.
vi.mock("@/lib/anthropic", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/anthropic")>();
  return { ...original, getAnthropic: vi.fn() };
});

import { prisma } from "@/lib/prisma";
import { getAnthropic } from "@/lib/anthropic";
import { POST } from "./route";

// --- helpers ---------------------------------------------------------------

const DOC: Document = {
  id: "doc1",
  filename: "nda.pdf",
  title: null,
  mimeType: "application/pdf",
  extractedText:
    "Confidentiality obligations survive for three (3) years after termination. Governing law is Delaware.",
  tokenCount: 25,
  tokenCountEstimated: false,
  createdAt: new Date(),
};

function validBody(overrides: Record<string, unknown> = {}) {
  return {
    docId: "doc1",
    prompt: "What is the governing law?",
    ...overrides,
  };
}

function request(body: unknown): Request {
  return new Request("http://test/api/review/cell", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

const USAGE = {
  input_tokens: 120,
  output_tokens: 45,
  cache_read_input_tokens: 3100,
  cache_creation_input_tokens: 0,
};

/** Script the mocked raw client to resolve with a tool_use message. */
function scriptToolUse(input: unknown, usage: Record<string, unknown> = USAGE) {
  const create = vi.fn().mockResolvedValue({
    content: [{ type: "tool_use", id: "tu1", name: REVIEW_TOOL_NAME, input }],
    stop_reason: "tool_use",
    usage,
  });
  vi.mocked(getAnthropic).mockReturnValue({
    messages: { create },
  } as unknown as ReturnType<typeof getAnthropic>);
  return create;
}

function scriptResponse(message: Record<string, unknown>) {
  const create = vi.fn().mockResolvedValue(message);
  vi.mocked(getAnthropic).mockReturnValue({
    messages: { create },
  } as unknown as ReturnType<typeof getAnthropic>);
  return create;
}

function scriptReject(err: unknown) {
  const create = vi.fn().mockRejectedValue(err);
  vi.mocked(getAnthropic).mockReturnValue({
    messages: { create },
  } as unknown as ReturnType<typeof getAnthropic>);
  return create;
}

const GOOD_ANSWER = {
  value: "Delaware",
  citations: [
    { docId: "doc1", quote: "Governing law is Delaware", section: "§12" },
  ],
  confidence: 0.95,
};

// --- tests -------------------------------------------------------------------

describe("POST /api/review/cell — rejections", () => {
  beforeEach(() => vi.clearAllMocks());

  it("400 on a non-JSON body", async () => {
    const res = await POST(request("not json {"));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/JSON/);
  });

  it("400 when docId or prompt is missing/empty", async () => {
    const res = await POST(request({ docId: "", prompt: "" }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBeTruthy();
  });

  it("404 with the id when the document is unknown", async () => {
    vi.mocked(prisma.document.findUnique).mockResolvedValue(null);
    const res = await POST(request(validBody({ docId: "ghost" })));
    expect(res.status).toBe(404);
    expect((await res.json()).error).toContain("ghost");
  });
});

describe("POST /api/review/cell — the call", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(prisma.document.findUnique).mockResolvedValue(DOC);
  });

  it("returns the verified answer per the contract, with usage for #17", async () => {
    scriptToolUse(GOOD_ANSWER);
    const res = await POST(request(validBody()));
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.answer.value).toBe("Delaware");
    expect(body.answer.citations[0].verified).toBe(true);
    expect(body.answer.confidence).toBe(0.95);
    expect(body.usage).toEqual({
      inputTokens: 120,
      outputTokens: 45,
      cacheReadInputTokens: 3100,
      cacheCreationInputTokens: 0,
    });
  });

  it("caps confidence at 0.3 when a quote fails verification", async () => {
    scriptToolUse({
      ...GOOD_ANSWER,
      citations: [{ docId: "doc1", quote: "this quote is not in the document" }],
    });
    const res = await POST(request(validBody()));
    const body = await res.json();
    expect(body.answer.citations[0].verified).toBe(false);
    expect(body.answer.confidence).toBe(0.3);
  });

  it("sends Sonnet, a cached system block, and FORCES the submit_answer tool", async () => {
    const create = scriptToolUse(GOOD_ANSWER);
    await POST(request(validBody()));

    const call = create.mock.calls[0][0];
    expect(call.model).toBe(MODELS.review);
    // single-shot, non-streaming, bounded output
    expect(call.stream).toBeUndefined();
    expect(call.max_tokens).toBeGreaterThan(0);
    // document text lives in ONE system block with the cache breakpoint —
    // the load-bearing cost lever. The varying prompt is the user message.
    expect(call.system).toHaveLength(1);
    expect(call.system[0].cache_control).toEqual({ type: "ephemeral" });
    expect(call.system[0].text).toContain("Confidentiality obligations survive");
    expect(call.system[0].text).toContain("(id: doc1)");
    expect(call.messages).toEqual([
      { role: "user", content: "What is the governing law?" },
    ]);
    expect(call.tool_choice).toEqual({
      type: "tool",
      name: REVIEW_TOOL_NAME,
      disable_parallel_tool_use: true,
    });
    expect(call.tools[0].name).toBe(REVIEW_TOOL_NAME);
  });

  it("honors a custom systemPromptTemplate (transparency parity)", async () => {
    const create = scriptToolUse(GOOD_ANSWER);
    await POST(
      request(validBody({ systemPromptTemplate: "Custom.\n{{DOCUMENTS}}" })),
    );
    expect(create.mock.calls[0][0].system[0].text).toMatch(/^Custom\./);
  });
});

describe("POST /api/review/cell — debuggable errors", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(prisma.document.findUnique).mockResolvedValue(DOC);
  });

  it("502 with a parse-error message naming the stop_reason when the tool input fails the contract", async () => {
    // a max_tokens cutoff truncates the tool input mid-JSON — the stop_reason
    // in the message is what tells the debugger to raise MAX_OUTPUT_TOKENS
    // rather than hunt a contract bug.
    const create = vi.fn().mockResolvedValue({
      content: [{ type: "tool_use", id: "tu1", name: REVIEW_TOOL_NAME, input: { value: "partial" } }],
      stop_reason: "max_tokens",
      usage: USAGE,
    });
    vi.mocked(getAnthropic).mockReturnValue({
      messages: { create },
    } as unknown as ReturnType<typeof getAnthropic>);

    const res = await POST(request(validBody()));
    expect(res.status).toBe(502);
    const { error } = await res.json();
    expect(error).toMatch(/parse error/i);
    expect(error).toContain("max_tokens");
  });

  it("coalesces null cache usage fields to 0 (doc under the cacheable minimum)", async () => {
    scriptToolUse(GOOD_ANSWER, {
      input_tokens: 900,
      output_tokens: 40,
      cache_read_input_tokens: null,
      cache_creation_input_tokens: null,
    });
    const res = await POST(request(validBody()));
    const body = await res.json();
    expect(body.usage.cacheReadInputTokens).toBe(0);
    expect(body.usage.cacheCreationInputTokens).toBe(0);
  });

  it("502 naming the stop_reason when the model returned no tool call", async () => {
    scriptResponse({
      content: [{ type: "text", text: "I refuse." }],
      stop_reason: "refusal",
      usage: USAGE,
    });
    const res = await POST(request(validBody()));
    expect(res.status).toBe(502);
    expect((await res.json()).error).toContain("refusal");
  });

  it("maps a context-ceiling rejection to a legible 413", async () => {
    scriptReject(
      Anthropic.APIError.generate(
        400,
        { type: "error", error: { type: "invalid_request_error", message: "prompt is too long: 250000 tokens" } },
        "prompt is too long: 250000 tokens",
        new Headers(),
      ),
    );
    const res = await POST(request(validBody()));
    expect(res.status).toBe(413);
    const { error } = await res.json();
    expect(error).toMatch(/context window/i);
    expect(error).not.toContain("250000");
  });

  it("maps a rate limit to 429", async () => {
    scriptReject(
      Anthropic.APIError.generate(
        429,
        { type: "error", error: { type: "rate_limit_error", message: "rate limited" } },
        "rate limited",
        new Headers(),
      ),
    );
    const res = await POST(request(validBody()));
    expect(res.status).toBe(429);
    expect((await res.json()).error).toMatch(/rate limit/i);
  });

  it("502 with the upstream message for other API errors", async () => {
    scriptReject(
      Anthropic.APIError.generate(
        529,
        { type: "error", error: { type: "overloaded_error", message: "Overloaded" } },
        "Overloaded",
        new Headers(),
      ),
    );
    const res = await POST(request(validBody()));
    expect(res.status).toBe(502);
    expect((await res.json()).error).toContain("Overloaded");
  });
});
