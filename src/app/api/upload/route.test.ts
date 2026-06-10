import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock persistence and token counting; extraction runs for real against
// generated fixtures so the happy path exercises pdf-parse end to end.
// vi.hoisted lets the mock factories (which are hoisted above imports) safely
// reference these handles.
const { createMock, countTokensMock } = vi.hoisted(() => ({
  createMock: vi.fn(),
  countTokensMock: vi.fn(),
}));
vi.mock("@/lib/prisma", () => ({
  prisma: { document: { create: createMock } },
}));
vi.mock("@/lib/tokens", () => ({ countTokens: countTokensMock }));

import { POST } from "@/app/api/upload/route";
import { PDF_MIME } from "@/lib/extract";
import { makePdf } from "@/test/fixtures";

function uploadRequest(file: File): Request {
  const form = new FormData();
  form.append("file", file);
  return new Request("http://localhost/api/upload", {
    method: "POST",
    body: form,
  });
}

describe("POST /api/upload", () => {
  beforeEach(() => vi.clearAllMocks());

  it("400s when no file is provided", async () => {
    const form = new FormData();
    const res = await POST(
      new Request("http://localhost/api/upload", {
        method: "POST",
        body: form,
      }),
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/no file/i);
  });

  it("400s on an unsupported file type", async () => {
    const file = new File(["hello"], "note.txt", {
      type: "text/plain",
    });
    const res = await POST(uploadRequest(file));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/unsupported/i);
  });

  it("400s on an empty file", async () => {
    const file = new File([], "empty.pdf", { type: PDF_MIME });
    const res = await POST(uploadRequest(file));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/empty/i);
  });

  it("extracts, counts tokens, persists, and returns metadata (no body text)", async () => {
    countTokensMock.mockResolvedValue({ count: 7, estimated: false });
    const createdAt = new Date("2026-06-10T00:00:00Z");
    createMock.mockResolvedValue({
      id: "doc_1",
      filename: "sample.pdf",
      mimeType: PDF_MIME,
      tokenCount: 7,
      tokenCountEstimated: false,
      createdAt,
    });

    const pdf = await makePdf("Contract terms and conditions");
    const file = new File([new Uint8Array(pdf)], "sample.pdf", {
      type: PDF_MIME,
    });
    const res = await POST(uploadRequest(file));

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.id).toBe("doc_1");
    expect(body.tokenCount).toBe(7);
    expect(body.tokenCountEstimated).toBe(false);
    // The full extracted text must never be echoed in the response.
    expect(body.extractedText).toBeUndefined();

    // The real extracted text was persisted.
    expect(createMock).toHaveBeenCalledOnce();
    const data = createMock.mock.calls[0][0].data;
    expect(data.filename).toBe("sample.pdf");
    expect(data.mimeType).toBe(PDF_MIME);
    expect(data.extractedText).toContain("Contract terms and conditions");
    expect(data.tokenCount).toBe(7);
    expect(data.tokenCountEstimated).toBe(false);
  });

  it("persists the estimated flag when token counting falls back", async () => {
    countTokensMock.mockResolvedValue({ count: 99, estimated: true });
    createMock.mockResolvedValue({
      id: "doc_2",
      filename: "sample.pdf",
      mimeType: PDF_MIME,
      tokenCount: 99,
      tokenCountEstimated: true,
      createdAt: new Date(),
    });

    const pdf = await makePdf("Some contract text");
    const file = new File([new Uint8Array(pdf)], "sample.pdf", {
      type: PDF_MIME,
    });
    const res = await POST(uploadRequest(file));

    expect(res.status).toBe(201);
    expect((await res.json()).tokenCountEstimated).toBe(true);
    expect(createMock.mock.calls[0][0].data.tokenCountEstimated).toBe(true);
  });

  it("422s when a supported file yields no extractable text", async () => {
    // A PDF MIME type on bytes that aren't a parseable PDF → ExtractionError.
    const file = new File(["not really a pdf"], "broken.pdf", {
      type: PDF_MIME,
    });
    const res = await POST(uploadRequest(file));
    expect(res.status).toBe(422);
    expect(createMock).not.toHaveBeenCalled();
  });
});
