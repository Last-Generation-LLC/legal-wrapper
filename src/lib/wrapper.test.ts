import { describe, it, expect } from "vitest";
import {
  DOCUMENTS_TOKEN,
  DEFAULT_SYSTEM_PROMPT,
  templateHasDocumentsToken,
  renderDocuments,
  composeSystemPrompt,
  composeAssistantSystemPrompt,
} from "@/lib/wrapper";
import { assistantPromptStrategy } from "@/lib/contract";
import type { Document } from "@prisma/client";

function doc(over: Partial<Document>): Document {
  return {
    id: "d_test",
    filename: "file.pdf",
    title: null,
    mimeType: "application/pdf",
    extractedText: "body",
    tokenCount: 0,
    tokenCountEstimated: false,
    createdAt: new Date("2026-06-10T00:00:00Z"),
    ...over,
  };
}

describe("default prompt + token", () => {
  it("uses {{DOCUMENTS}} as the token", () => {
    expect(DOCUMENTS_TOKEN).toBe("{{DOCUMENTS}}");
  });

  it("ships the mock contract-review prompt containing the token", () => {
    expect(DEFAULT_SYSTEM_PROMPT).toContain(
      "You are a contract review assistant for an in-house legal team.",
    );
    expect(DEFAULT_SYSTEM_PROMPT).toContain(DOCUMENTS_TOKEN);
  });
});

describe("templateHasDocumentsToken", () => {
  it("detects the token's presence", () => {
    expect(templateHasDocumentsToken("a {{DOCUMENTS}} b")).toBe(true);
    expect(templateHasDocumentsToken("no token here")).toBe(false);
  });
});

describe("renderDocuments", () => {
  it("renders a single doc with the delimited header and full text", () => {
    const out = renderDocuments([
      doc({ filename: "msa.pdf", title: null, extractedText: "MSA text here" }),
    ]);
    expect(out).toBe("===== DOCUMENT: msa.pdf =====\nMSA text here");
  });

  it("prefers title over filename when title is present", () => {
    const out = renderDocuments([
      doc({ filename: "msa.pdf", title: "Master Services Agreement", extractedText: "x" }),
    ]);
    expect(out).toContain("===== DOCUMENT: Master Services Agreement =====");
  });

  it("falls back to filename when title is blank/whitespace", () => {
    const out = renderDocuments([
      doc({ filename: "nda.docx", title: "   ", extractedText: "y" }),
    ]);
    expect(out).toContain("===== DOCUMENT: nda.docx =====");
  });

  it("joins multiple docs with a blank line, preserving order", () => {
    const out = renderDocuments([
      doc({ filename: "a.pdf", extractedText: "AAA" }),
      doc({ filename: "b.pdf", extractedText: "BBB" }),
    ]);
    expect(out).toBe(
      "===== DOCUMENT: a.pdf =====\nAAA\n\n===== DOCUMENT: b.pdf =====\nBBB",
    );
  });

  it("returns an empty string for no docs", () => {
    expect(renderDocuments([])).toBe("");
  });
});

describe("composeSystemPrompt", () => {
  it("substitutes the rendered block for the token using the default template", () => {
    const out = composeSystemPrompt([doc({ filename: "a.pdf", extractedText: "AAA" })]);
    expect(out).not.toContain("{{DOCUMENTS}}"); // token consumed
    expect(out).toContain("===== DOCUMENT: a.pdf =====\nAAA");
    expect(out).toContain("You are a contract review assistant"); // rest of prompt intact
  });

  it("uses a caller-supplied template (the editable-panel path)", () => {
    const out = composeSystemPrompt(
      [doc({ filename: "a.pdf", extractedText: "AAA" })],
      "Custom prompt.\n{{DOCUMENTS}}",
    );
    expect(out).toBe("Custom prompt.\n===== DOCUMENT: a.pdf =====\nAAA");
  });

  it("appends the documents block when an edited template omits the token", () => {
    const out = composeSystemPrompt(
      [doc({ filename: "a.pdf", extractedText: "AAA" })],
      "Edited prompt with no token.",
    );
    expect(out).toBe(
      "Edited prompt with no token.\n\n# Attached documents\n===== DOCUMENT: a.pdf =====\nAAA",
    );
  });

  it("treats the document text literally (no $-pattern substitution)", () => {
    // Regression guard: String.replace/replaceAll honor $&, $1, $$ in the
    // replacement string. The composer must use literal substitution so a
    // document containing "$&" is preserved verbatim.
    const out = composeSystemPrompt(
      [doc({ filename: "a.pdf", extractedText: "price is $5 & rising $& done" })],
      "{{DOCUMENTS}}",
    );
    expect(out).toContain("price is $5 & rising $& done");
  });

  it("replaces an empty selection with an empty block", () => {
    const out = composeSystemPrompt([], "before {{DOCUMENTS}} after");
    expect(out).toBe("before  after");
  });
});

describe("composeAssistantSystemPrompt", () => {
  const msa = doc({
    filename: "msa.pdf",
    title: null,
    extractedText: "The term of this Agreement is five (5) years.",
  });

  it("is the filled template, then a blank line, then the strategy — nothing else", () => {
    const template = `Custom prompt.\n{{DOCUMENTS}}`;
    const result = composeAssistantSystemPrompt([msa], template);
    expect(result).toBe(
      `Custom prompt.\n===== DOCUMENT: msa.pdf =====\nThe term of this Agreement is five (5) years.\n\n${assistantPromptStrategy()}`,
    );
  });

  it("defaults to DEFAULT_SYSTEM_PROMPT when no template is given", () => {
    const result = composeAssistantSystemPrompt([msa]);
    expect(result.startsWith("You are a contract review assistant")).toBe(true);
    expect(result).toContain("The term of this Agreement");
    expect(result.endsWith(assistantPromptStrategy())).toBe(true);
  });

  it("composes with zero documents (empty docIds is allowed)", () => {
    const result = composeAssistantSystemPrompt([], "Prompt.\n{{DOCUMENTS}}");
    expect(result).toContain("Prompt.");
    expect(result.endsWith(assistantPromptStrategy())).toBe(true);
  });
});
