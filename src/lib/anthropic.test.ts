import { describe, it, expect } from "vitest";
import {
  MODELS,
  modelFor,
  TOKEN_COUNT_MODEL,
  getAnthropicProvider,
  languageModelFor,
} from "@/lib/anthropic";

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
