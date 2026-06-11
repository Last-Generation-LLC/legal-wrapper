import { describe, it, expect } from "vitest";
import { normalizeWhitespace, verifyCitation } from "@/lib/citation";

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

  it("rejects a fabricated quote not present in the text", () => {
    expect(verifyCitation("liability is capped at fees paid", docText)).toBe(false);
  });

  it("rejects an empty quote", () => {
    expect(verifyCitation("", docText)).toBe(false);
    expect(verifyCitation("   ", docText)).toBe(false);
  });
});
