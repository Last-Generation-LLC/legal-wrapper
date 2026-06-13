// src/lib/pricing.test.ts
import { describe, expect, it } from "vitest";
import {
  cacheHitRate,
  formatCachePct,
  formatUsd,
  sumUsage,
  usageCostUsd,
  type TokenUsage,
} from "@/lib/pricing";

const zero: TokenUsage = {
  uncachedInputTokens: 0,
  cacheReadInputTokens: 0,
  cacheWriteInputTokens: 0,
  outputTokens: 0,
};

describe("usageCostUsd", () => {
  it("prices uncached input, output, and the two cache tiers (sonnet)", () => {
    // sonnet: $3 in / $15 out per MTok. read 0.1x, write 1.25x.
    const usage: TokenUsage = {
      uncachedInputTokens: 1000,
      cacheReadInputTokens: 2000,
      cacheWriteInputTokens: 500,
      outputTokens: 100,
    };
    // 1000*3e-6 + 2000*3e-6*0.1 + 500*3e-6*1.25 + 100*15e-6
    expect(usageCostUsd(usage, "claude-sonnet-4-6")).toBeCloseTo(0.006975, 6);
  });

  it("prices opus rates", () => {
    const usage: TokenUsage = { ...zero, uncachedInputTokens: 1_000_000, outputTokens: 1_000_000 };
    expect(usageCostUsd(usage, "claude-opus-4-8")).toBeCloseTo(30, 6); // $5 + $25
  });

  it("returns 0 for an unknown model rather than a wrong number", () => {
    expect(usageCostUsd({ ...zero, uncachedInputTokens: 1000 }, "no-such-model")).toBe(0);
  });
});

describe("cacheHitRate", () => {
  it("is cacheRead over total input", () => {
    expect(
      cacheHitRate({ uncachedInputTokens: 100, cacheReadInputTokens: 900, cacheWriteInputTokens: 0, outputTokens: 50 }),
    ).toBeCloseTo(0.9, 6);
  });
  it("counts cache writes in the denominator (a write is not a hit)", () => {
    expect(
      cacheHitRate({ uncachedInputTokens: 0, cacheReadInputTokens: 0, cacheWriteInputTokens: 1000, outputTokens: 0 }),
    ).toBe(0);
  });
  it("is 0 when there is no input at all", () => {
    expect(cacheHitRate(zero)).toBe(0);
  });
});

describe("sumUsage", () => {
  it("adds element-wise", () => {
    const a: TokenUsage = { uncachedInputTokens: 1, cacheReadInputTokens: 2, cacheWriteInputTokens: 3, outputTokens: 4 };
    const b: TokenUsage = { uncachedInputTokens: 10, cacheReadInputTokens: 20, cacheWriteInputTokens: 30, outputTokens: 40 };
    expect(sumUsage([a, b])).toEqual({
      uncachedInputTokens: 11,
      cacheReadInputTokens: 22,
      cacheWriteInputTokens: 33,
      outputTokens: 44,
    });
  });
  it("returns a zero usage for an empty list", () => {
    expect(sumUsage([])).toEqual(zero);
  });
});

describe("formatUsd", () => {
  it("shows two decimals at or above $1", () => {
    expect(formatUsd(1.2)).toBe("$1.20");
  });
  it("shows four decimals below $1 (the point is that the cost is tiny)", () => {
    expect(formatUsd(0.0123)).toBe("$0.0123");
  });
  it("floors a sub-fraction-of-a-cent value to a marker", () => {
    expect(formatUsd(0.00005)).toBe("<$0.0001");
  });
  it("renders an exact zero plainly", () => {
    expect(formatUsd(0)).toBe("$0.00");
  });
});

describe("formatCachePct", () => {
  it("rounds to a whole percent", () => {
    expect(formatCachePct(0.876)).toBe("88%");
    expect(formatCachePct(0)).toBe("0%");
  });
});
