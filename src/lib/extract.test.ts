import { describe, it, expect } from "vitest";
import {
  extractText,
  isSupportedMimeType,
  UnsupportedFileTypeError,
  ExtractionError,
  PDF_MIME,
  DOCX_MIME,
} from "@/lib/extract";
import { makePdf, makeBlankPdf, makeDocx, makeMultiPagePdf } from "@/test/fixtures";

describe("isSupportedMimeType", () => {
  it("accepts PDF and DOCX", () => {
    expect(isSupportedMimeType(PDF_MIME)).toBe(true);
    expect(isSupportedMimeType(DOCX_MIME)).toBe(true);
  });
  it("rejects anything else", () => {
    expect(isSupportedMimeType("text/plain")).toBe(false);
    expect(isSupportedMimeType("")).toBe(false);
  });
});

describe("extractText", () => {
  it("extracts text and page count from a real PDF", async () => {
    const buffer = await makePdf("Hello PDF world");
    const result = await extractText(buffer, PDF_MIME);
    expect(result.text).toContain("Hello PDF world");
    expect(result.pageCount).toBe(1);
  });

  it("extracts text from a real DOCX", async () => {
    const buffer = await makeDocx("Hello DOCX world");
    const result = await extractText(buffer, DOCX_MIME);
    expect(result.text).toContain("Hello DOCX world");
    // DOCX has no inherent page count.
    expect(result.pageCount).toBeUndefined();
  });

  it("rejects unsupported MIME types", async () => {
    await expect(
      extractText(Buffer.from("plain text"), "text/plain"),
    ).rejects.toBeInstanceOf(UnsupportedFileTypeError);
  });

  it("throws ExtractionError on a text-less (scanned-style) PDF instead of saving empty", async () => {
    const buffer = await makeBlankPdf();
    await expect(extractText(buffer, PDF_MIME)).rejects.toBeInstanceOf(
      ExtractionError,
    );
  });

  it("throws ExtractionError on a corrupt PDF", async () => {
    await expect(
      extractText(Buffer.from("this is not a pdf"), PDF_MIME),
    ).rejects.toBeInstanceOf(ExtractionError);
  });

  it("preserves pdf page markers in the stored text (so pages are derivable)", async () => {
    const buffer = await makeMultiPagePdf(["First page body", "Second page body"]);
    const result = await extractText(buffer, PDF_MIME);
    // The page-boundary markers must survive into stored text now.
    expect(result.text).toMatch(/-- 1 of 2 --/);
    expect(result.text).toMatch(/-- 2 of 2 --/);
    expect(result.text).toContain("First page body");
    expect(result.text).toContain("Second page body");
  });

  it("still rejects a multi-page text-less PDF (markers alone are not content)", async () => {
    // Two blank pages: the only text pdf-parse yields is the page markers.
    // The empty-guard must strip markers before deciding it is empty.
    const buffer = await makeMultiPagePdf(["", ""]);
    await expect(extractText(buffer, PDF_MIME)).rejects.toBeInstanceOf(
      ExtractionError,
    );
  });
});
