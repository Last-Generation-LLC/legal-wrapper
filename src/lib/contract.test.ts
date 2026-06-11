import { describe, it, expect } from "vitest";
import {
  RawAnswerSchema,
  RawFooterSchema,
  MIN_QUOTE_LENGTH,
  assistantPromptStrategy,
  reviewPromptStrategy,
  FOOTER_OPEN,
  FOOTER_CLOSE,
  REVIEW_TOOL_NAME,
  buildReviewTool,
  parseAssistantFooter,
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

describe("prompt strategies", () => {
  it("share the anti-fabrication core", () => {
    for (const text of [assistantPromptStrategy(), reviewPromptStrategy()]) {
      expect(text.toLowerCase()).toContain("verbatim");
      expect(text).toMatch(/only|do not invent|never/i);
      expect(text).toContain("-- N of M --"); // explains the page markers
      expect(text.toLowerCase()).toContain("support"); // confidence = document support
    }
  });

  it("the assistant strategy describes the footer delimiters", () => {
    const text = assistantPromptStrategy();
    expect(text).toContain(FOOTER_OPEN);
    expect(text).toContain(FOOTER_CLOSE);
  });

  it("the review strategy points at the tool", () => {
    expect(reviewPromptStrategy()).toContain(REVIEW_TOOL_NAME);
  });
});

describe("buildReviewTool", () => {
  it("produces an Anthropic tool with a JSON-Schema input", () => {
    const tool = buildReviewTool();
    expect(tool.name).toBe(REVIEW_TOOL_NAME);
    expect(typeof tool.description).toBe("string");
    const schema = tool.input_schema as { type: string; properties: Record<string, unknown>; required?: string[] };
    expect(schema.type).toBe("object");
    expect(Object.keys(schema.properties)).toEqual(expect.arrayContaining(["value", "citations", "confidence"]));
    expect(schema.required).toEqual(expect.arrayContaining(["value", "citations", "confidence"]));
  });
});

describe("parseAssistantFooter", () => {
  const footer = `${FOOTER_OPEN}\n{"citations":[{"docId":"doc_1","quote":"liability shall be uncapped"}],"confidence":0.8}\n${FOOTER_CLOSE}`;

  it("splits prose from a complete footer", () => {
    const result = parseAssistantFooter(`Here is the answer.\n\n${footer}`);
    expect(result.value).toBe("Here is the answer.");
    expect(result.footer?.confidence).toBe(0.8);
    expect(result.footer?.citations[0].docId).toBe("doc_1");
  });

  it("returns null footer and full text when no footer present", () => {
    const result = parseAssistantFooter("Just prose, still streaming");
    expect(result.value).toBe("Just prose, still streaming");
    expect(result.footer).toBeNull();
  });

  it("returns null footer when the footer is not yet closed (mid-stream)", () => {
    const result = parseAssistantFooter(`Answer.\n${FOOTER_OPEN}\n{"citations":[`);
    expect(result.value).toBe("Answer.");
    expect(result.footer).toBeNull();
  });

  it("returns null footer (not a throw) on malformed JSON", () => {
    const result = parseAssistantFooter(`Answer.\n${FOOTER_OPEN}\nnot json at all\n${FOOTER_CLOSE}`);
    expect(result.value).toBe("Answer.");
    expect(result.footer).toBeNull();
  });
});
