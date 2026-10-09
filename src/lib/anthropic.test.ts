import { describe, it, expect } from "vitest";
import {
  MODELS,
  modelFor,
  TOKEN_COUNT_MODEL,
  getAnthropicProvider,
  languageModelFor,
  REVIEW_MODEL_IDS,
  supportsForcedToolChoice,
} from "@/lib/anthropic";
import { MODEL_PRICING } from "@/lib/pricing";

describe("model registry", () => {
  it("pins the verified Assistant (Opus) and Review (Sonnet) model IDs", () => {
    // Verified against live Anthropic docs 2026-06; mock "4.5" labels were placeholders.
    expect(MODELS.assistant).toBe("claude-opus-4-8");
    expect(MODELS.review).toBe("claude-sonnet-4-6");
  });

  it("exposes a role accessor", () => {
    expect(modelFor("assistant")).toBe("claude-opus-4-8");
    expect(modelFor("review")).toBe("claude-sonnet-4-6");
  });

  it("derives the token-count model from the registry (single source of truth)", () => {
    // The context meter measures against the Assistant model; keep one definition.
    expect(TOKEN_COUNT_MODEL).toBe(MODELS.assistant);
  });
});

describe("AI SDK provider seam", () => {
  it("resolves a language model whose modelId matches the role registry", () => {
    const model = languageModelFor("assistant");
    expect(model.modelId).toBe("claude-opus-4-8");
    expect(languageModelFor("review").modelId).toBe("claude-sonnet-4-6");
  });

  it("memoizes the default provider (same instance across calls)", () => {
    expect(getAnthropicProvider()).toBe(getAnthropicProvider());
  });

  it("builds a FRESH provider when an explicit apiKey is given (BYO-key hook)", () => {
    // A per-request key must never be cached into the shared singleton.
    const byo = getAnthropicProvider("sk-ant-test-not-real");
    expect(byo).not.toBe(getAnthropicProvider());
  });
});

describe("Review model picker allowlist", () => {
  it("offers the default Review model plus Sonnet 5.5 and Haiku 5.5", () => {
    expect(REVIEW_MODEL_IDS).toContain(MODELS.review);
    expect(REVIEW_MODEL_IDS).toContain("claude-sonnet-5-5");
    expect(REVIEW_MODEL_IDS).toContain("claude-haiku-5-5");
  });

  it("prices every pickable model, so the cost pill never silently hides", () => {
    for (const id of REVIEW_MODEL_IDS) expect(MODEL_PRICING[id]).toBeDefined();
  });

  it("flags Sonnet 5.5 as rejecting forced tool_choice (live-probed 2026-10)", () => {
    expect(supportsForcedToolChoice("claude-sonnet-5-5")).toBe(false);
    expect(supportsForcedToolChoice("claude-sonnet-4-6")).toBe(true);
    expect(supportsForcedToolChoice("claude-haiku-5-5")).toBe(true);
  });
});
