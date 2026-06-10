import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the Anthropic client so tests need no API key or network.
const { countTokensMock } = vi.hoisted(() => ({ countTokensMock: vi.fn() }));
vi.mock("@/lib/anthropic", () => ({
  getAnthropic: () => ({ messages: { countTokens: countTokensMock } }),
  TOKEN_COUNT_MODEL: "claude-opus-4-8",
}));

import { countTokens } from "@/lib/tokens";

describe("countTokens", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns the exact count from the API and marks it not estimated", async () => {
    countTokensMock.mockResolvedValue({ input_tokens: 123 } as never);
    const result = await countTokens("some document text");
    expect(result).toEqual({ count: 123, estimated: false });
    expect(countTokensMock).toHaveBeenCalledWith({
      model: "claude-opus-4-8",
      messages: [{ role: "user", content: "some document text" }],
    });
  });

  it("falls back to a flagged char-based estimate when the API call fails", async () => {
    countTokensMock.mockRejectedValue(new Error("missing API key"));
    const text = "x".repeat(40); // 40 chars / 4 = 10 tokens
    const result = await countTokens(text);
    expect(result.estimated).toBe(true);
    expect(result.count).toBe(10);
  });
});
