import { describe, it, expect } from "vitest";
import { normalizeWhitespace, verifyCitation, derivePage } from "@/lib/citation";

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
