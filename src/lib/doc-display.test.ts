import { describe, it, expect } from "vitest";
import { PDF_MIME, DOCX_MIME } from "@/lib/extract";
import { docFormat, formatTokens, docLabel, citationLabel } from "@/lib/doc-display";
import type { DocumentMeta } from "@/lib/documents";

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

const docs: DocumentMeta[] = [
  {
    id: "d1",
    filename: "acme-nda.pdf",
    title: null,
    mimeType: "application/pdf",
    tokenCount: 5000,
    tokenCountEstimated: false,
    createdAt: new Date(),
  },
];

describe("citationLabel", () => {
  it("strips the extension and appends section + page", () => {
    expect(
      citationLabel({ docId: "d1", quote: "q", section: "§14.1", page: 6, verified: true }, docs),
    ).toBe("acme-nda §14.1 · p.6");
  });

  it("marks unverified citations", () => {
    expect(
      citationLabel({ docId: "d1", quote: "q", section: "§3", verified: false }, docs),
    ).toBe("acme-nda §3 · unverified");
  });

  it("falls back to the docId when the document is unknown", () => {
    expect(
      citationLabel({ docId: "ghost", quote: "q", verified: true }, docs),
    ).toBe("ghost");
  });
});
