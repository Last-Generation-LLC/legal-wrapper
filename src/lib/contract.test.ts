import { describe, it, expect } from "vitest";
import {
  RawAnswerSchema,
  RawFooterSchema,
  MIN_QUOTE_LENGTH,
} from "@/lib/contract";

describe("RawAnswerSchema", () => {
  const valid = {
    value: "The liability cap is uncapped for confidentiality breaches.",
    citations: [
      { docId: "doc_1", quote: "Liability shall be uncapped for breach of confidentiality", section: "§12" },
    ],
    confidence: 0.82,
  };

  it("accepts a well-formed answer", () => {
    expect(RawAnswerSchema.safeParse(valid).success).toBe(true);
  });

  it("rejects confidence outside 0..1", () => {
    expect(RawAnswerSchema.safeParse({ ...valid, confidence: 1.5 }).success).toBe(false);
    expect(RawAnswerSchema.safeParse({ ...valid, confidence: -0.1 }).success).toBe(false);
  });

  it("rejects a citation with too short / missing a quote", () => {
    const short = "a".repeat(MIN_QUOTE_LENGTH - 1);
    expect(
      RawAnswerSchema.safeParse({ ...valid, citations: [{ docId: "doc_1", quote: short }] }).success,
    ).toBe(false);
    expect(
      RawAnswerSchema.safeParse({ ...valid, citations: [{ docId: "doc_1" }] }).success,
    ).toBe(false);
  });

  it("treats section as optional", () => {
    const noSection = { ...valid, citations: [{ docId: "doc_1", quote: valid.citations[0].quote }] };
    expect(RawAnswerSchema.safeParse(noSection).success).toBe(true);
  });
});

describe("RawFooterSchema", () => {
  it("is the answer shape without value", () => {
    const footer = { citations: [], confidence: 0.5 };
    expect(RawFooterSchema.safeParse(footer).success).toBe(true);
    // value is not part of the footer
    expect(RawFooterSchema.safeParse({ ...footer, value: "x" }).success).toBe(true); // extra key ignored
    expect("value" in RawFooterSchema.parse({ ...footer })).toBe(false);
  });
});
