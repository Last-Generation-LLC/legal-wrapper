import { describe, it, expect } from "vitest";
import { normalizeWhitespace, verifyCitation, derivePage, applyConfidence, verifyAnswer } from "@/lib/citation";
import { FAILED_CITATION_CONFIDENCE_CAP, type RawAnswer } from "@/lib/contract";

describe("normalizeWhitespace", () => {
  it("collapses runs of whitespace and trims", () => {
    expect(normalizeWhitespace("  a\n  b\t c  ")).toBe("a b c");
  });
});

describe("verifyCitation", () => {
  const docText = "The Agreement provides that\nliability shall be uncapped for\nbreach of confidentiality.";

  it("accepts an exact quote (whitespace-insensitive)", () => {
    expect(verifyCitation("liability shall be uncapped for breach", docText)).toBe(true);
  });

  it("normalizes the quote side too (a quote with its own linebreak still matches)", () => {
    // Proves BOTH sides of the comparison are normalized — guards against a
    // regression where only docText is normalized and the raw quote is used.
    expect(verifyCitation("uncapped for\nbreach", docText)).toBe(true);
  });

  it("rejects a fabricated quote not present in the text", () => {
    expect(verifyCitation("liability is capped at fees paid", docText)).toBe(false);
  });

  it("rejects an empty quote", () => {
    expect(verifyCitation("", docText)).toBe(false);
    expect(verifyCitation("   ", docText)).toBe(false);
  });
});

describe("derivePage", () => {
  // Trailing markers, matching real pdf-parse output: each "-- N of M --"
  // FOLLOWS the content of page N.
  const paged =
    "Recitals and definitions here.\n-- 1 of 2 --\nLiability shall be uncapped for breach.\n-- 2 of 2 --";

  it("returns the page the quote falls under", () => {
    expect(derivePage(paged, "Liability shall be uncapped for breach")).toBe(2);
    expect(derivePage(paged, "Recitals and definitions here")).toBe(1);
  });

  it("returns undefined when the quote is absent", () => {
    expect(derivePage(paged, "no such text anywhere")).toBeUndefined();
  });

  it("returns undefined when there are no page markers (DOCX / pre-existing docs)", () => {
    expect(derivePage("Plain docx text with no markers at all.", "Plain docx text")).toBeUndefined();
  });
});

describe("applyConfidence", () => {
  it("passes confidence through when nothing failed", () => {
    expect(applyConfidence(0.9, false)).toBe(0.9);
  });
  it("caps confidence at the low band when something failed", () => {
    expect(applyConfidence(0.9, true)).toBe(FAILED_CITATION_CONFIDENCE_CAP);
    expect(applyConfidence(0.2, true)).toBe(0.2); // never raises an already-low score
  });
});

describe("verifyAnswer", () => {
  // Trailing marker, matching real pdf-parse output.
  const docText = "Liability shall be uncapped for breach of confidentiality.\n-- 1 of 1 --";
  const docs = new Map<string, string>([["doc_1", docText]]);

  it("marks real citations verified, derives page, and keeps confidence", () => {
    const answer: RawAnswer = {
      value: "Uncapped for confidentiality.",
      citations: [{ docId: "doc_1", quote: "Liability shall be uncapped for breach", section: "§12" }],
      confidence: 0.88,
    };
    const result = verifyAnswer(answer, docs);
    expect(result.citations[0].verified).toBe(true);
    expect(result.citations[0].page).toBe(1);
    expect(result.confidence).toBe(0.88);
  });

  it("flags a fabricated citation and caps the whole answer's confidence", () => {
    const answer: RawAnswer = {
      value: "Capped at fees.",
      citations: [{ docId: "doc_1", quote: "liability is capped at fees paid in the prior 12 months" }],
      confidence: 0.95,
    };
    const result = verifyAnswer(answer, docs);
    expect(result.citations[0].verified).toBe(false);
    expect(result.citations[0].page).toBeUndefined();
    expect(result.confidence).toBe(FAILED_CITATION_CONFIDENCE_CAP);
  });

  it("treats an unknown docId as unverified", () => {
    const answer: RawAnswer = {
      value: "x",
      citations: [{ docId: "missing", quote: "Liability shall be uncapped for breach" }],
      confidence: 0.7,
    };
    const result = verifyAnswer(answer, docs);
    expect(result.citations[0].verified).toBe(false);
    expect(result.confidence).toBe(FAILED_CITATION_CONFIDENCE_CAP);
  });
});
