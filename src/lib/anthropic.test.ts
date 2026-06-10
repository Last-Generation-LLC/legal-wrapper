import { describe, it, expect } from "vitest";
import { MODELS, modelFor, TOKEN_COUNT_MODEL } from "@/lib/anthropic";

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
