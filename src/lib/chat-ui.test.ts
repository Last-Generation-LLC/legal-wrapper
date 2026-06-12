import { describe, it, expect } from "vitest";
import { FOOTER_OPEN, FOOTER_CLOSE, type VerifiedAnswer } from "@/lib/contract";
import {
  confidenceTone,
  displayText,
  verifiedAnswerOf,
  formatClock,
  estimateTokens,
  originatingUserMessage,
  resolveEditTarget,
  modelDisplayLabel,
  type AssistantUIMessage,
} from "./chat-ui";

// --- helpers ---------------------------------------------------------------

function textMessage(
  role: "user" | "assistant",
  text: string,
): AssistantUIMessage {
  return { id: "m1", role, parts: [{ type: "text", text }] };
}

const ANSWER: VerifiedAnswer = {
  value: "The cap is 2x fees.",
  citations: [
    { docId: "doc1", quote: "liability shall not exceed", section: "§12.1", verified: true, page: 22 },
  ],
  confidence: 0.94,
};

// --- confidenceTone ----------------------------------------------------------

describe("confidenceTone", () => {
  it("is ok (green) strictly above 0.92", () => {
    expect(confidenceTone(0.93)).toBe("ok");
    expect(confidenceTone(1)).toBe("ok");
  });

  it("is warn (amber) strictly above 0.85, up to 0.92", () => {
    expect(confidenceTone(0.92)).toBe("warn");
    expect(confidenceTone(0.86)).toBe("warn");
  });

  it("is bad (red) at 0.85 and below", () => {
    expect(confidenceTone(0.85)).toBe("bad");
    expect(confidenceTone(0.3)).toBe("bad");
    expect(confidenceTone(0)).toBe("bad");
  });
});

// --- verifiedAnswerOf --------------------------------------------------------

describe("verifiedAnswerOf", () => {
  it("returns the data-citations part's answer when present", () => {
    const m: AssistantUIMessage = {
      id: "m1",
      role: "assistant",
      parts: [
        { type: "text", text: "raw" },
        { type: "data-citations", data: ANSWER },
      ],
    };
    expect(verifiedAnswerOf(m)).toEqual(ANSWER);
  });

  it("returns null when absent", () => {
    expect(verifiedAnswerOf(textMessage("assistant", "hi"))).toBeNull();
  });
});

// --- displayText -------------------------------------------------------------

describe("displayText", () => {
  it("returns user message text as-is", () => {
    expect(displayText(textMessage("user", "Compare the clauses."))).toBe(
      "Compare the clauses.",
    );
  });

  it("prefers the server-verified value when the data part exists", () => {
    const m: AssistantUIMessage = {
      id: "m1",
      role: "assistant",
      parts: [
        { type: "text", text: `prose${FOOTER_OPEN}{}${FOOTER_CLOSE}` },
        { type: "data-citations", data: ANSWER },
      ],
    };
    expect(displayText(m)).toBe(ANSWER.value);
  });

  it("strips a complete footer from assistant prose", () => {
    const text = `The cap is 2x fees.\n${FOOTER_OPEN}\n{"citations":[],"confidence":0.9}\n${FOOTER_CLOSE}`;
    expect(displayText(textMessage("assistant", text))).toBe("The cap is 2x fees.");
  });

  it("hides a footer that is still streaming (opened, not yet closed)", () => {
    const text = `The cap is 2x fees.\n${FOOTER_OPEN}\n{"citations":[`;
    expect(displayText(textMessage("assistant", text))).toBe("The cap is 2x fees.");
  });

  it("concatenates multiple text parts", () => {
    const m: AssistantUIMessage = {
      id: "m1",
      role: "assistant",
      parts: [
        { type: "text", text: "Hello " },
        { type: "text", text: "world." },
      ],
    };
    expect(displayText(m)).toBe("Hello world.");
  });
});

// --- formatClock / estimateTokens --------------------------------------------

describe("formatClock", () => {
  it("formats a timestamp as HH:MM (24h)", () => {
    const ts = new Date(2026, 5, 12, 10, 42).getTime();
    expect(formatClock(ts)).toBe("10:42");
  });

  it("zero-pads hours and minutes", () => {
    const ts = new Date(2026, 5, 12, 9, 5).getTime();
    expect(formatClock(ts)).toBe("09:05");
  });
});

// --- originatingUserMessage ---------------------------------------------------

describe("originatingUserMessage", () => {
  const thread: AssistantUIMessage[] = [
    { id: "u1", role: "user", parts: [{ type: "text", text: "first q" }] },
    { id: "a1", role: "assistant", parts: [{ type: "text", text: "first a" }] },
    { id: "u2", role: "user", parts: [{ type: "text", text: "second q" }] },
    { id: "a2", role: "assistant", parts: [{ type: "text", text: "second a" }] },
  ];

  it("finds the nearest user message before the assistant message", () => {
    expect(originatingUserMessage(thread, "a2")?.id).toBe("u2");
    expect(originatingUserMessage(thread, "a1")?.id).toBe("u1");
  });

  it("returns null for an unknown id", () => {
    expect(originatingUserMessage(thread, "nope")).toBeNull();
  });

  it("returns null when no user message precedes it", () => {
    const orphan: AssistantUIMessage[] = [
      { id: "a0", role: "assistant", parts: [{ type: "text", text: "hi" }] },
    ];
    expect(originatingUserMessage(orphan, "a0")).toBeNull();
  });

  it("resolveEditTarget keeps the id while the message exists, drops it after truncation", () => {
    expect(resolveEditTarget(thread, "u2")).toBe("u2");
    // a regenerate on an earlier message truncated u2 away
    expect(resolveEditTarget(thread.slice(0, 2), "u2")).toBeNull();
    expect(resolveEditTarget(thread, null)).toBeNull();
  });
});

// --- modelDisplayLabel ---------------------------------------------------------

describe("modelDisplayLabel", () => {
  it("formats a pinned model id as FAMILY MAJOR.MINOR", () => {
    expect(modelDisplayLabel("claude-opus-4-8")).toBe("OPUS 4.8");
    expect(modelDisplayLabel("claude-sonnet-4-6")).toBe("SONNET 4.6");
  });

  it("ignores date-stamp suffixes", () => {
    expect(modelDisplayLabel("claude-haiku-4-5-20251001")).toBe("HAIKU 4.5");
  });
});

describe("estimateTokens", () => {
  it("estimates ~4 chars per token", () => {
    expect(estimateTokens("a".repeat(400))).toBe(100);
  });

  it("is 0 for empty text", () => {
    expect(estimateTokens("")).toBe(0);
  });
});
