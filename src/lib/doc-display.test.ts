import { describe, it, expect } from "vitest";
import { PDF_MIME, DOCX_MIME } from "@/lib/extract";
import { docFormat, formatTokens, docLabel } from "@/lib/doc-display";

describe("docFormat", () => {
  it("maps known MIME types to short uppercase labels", () => {
    expect(docFormat(PDF_MIME)).toBe("PDF");
    expect(docFormat(DOCX_MIME)).toBe("DOCX");
  });
  it("falls back to FILE for anything else", () => {
    expect(docFormat("application/octet-stream")).toBe("FILE");
  });
});

describe("formatTokens", () => {
  it("formats thousands to one decimal with a 'k tok' suffix", () => {
    expect(formatTokens(31420, false)).toBe("31.4k tok");
  });
  it("prefixes a tilde when the count is an estimate", () => {
    expect(formatTokens(31420, true)).toBe("~31.4k tok");
  });
});

describe("docLabel", () => {
  it("prefers the friendly title", () => {
    expect(docLabel({ title: "Master Agreement", filename: "msa_v4.pdf" })).toBe("Master Agreement");
  });
  it("falls back to the filename when title is null", () => {
    expect(docLabel({ title: null, filename: "msa_v4.pdf" })).toBe("msa_v4.pdf");
  });
});
