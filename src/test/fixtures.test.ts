import { describe, it, expect } from "vitest";
import { makeMultiPagePdf } from "@/test/fixtures";
import { extractText, PDF_MIME } from "@/lib/extract";

describe("makeMultiPagePdf", () => {
  it("produces a PDF with one page per string", async () => {
    // extractText already reports pageCount, so we can assert the page count
    // without depending on the (Task 2) marker change.
    const buffer = await makeMultiPagePdf(["Page one text", "Page two text"]);
    const result = await extractText(buffer, PDF_MIME);
    expect(result.pageCount).toBe(2);
    expect(result.text).toContain("Page one text");
    expect(result.text).toContain("Page two text");
  });
});
