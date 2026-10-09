import Anthropic from "@anthropic-ai/sdk";
import { createAnthropic, type AnthropicProvider } from "@ai-sdk/anthropic";

// Shared Anthropic client.
//
// Minimal on purpose: this task (upload + token counting) only needs a client
// to call the count_tokens endpoint. Task #7 (Anthropic client + wrapper
// system prompt) builds the Assistant's request construction on top of this.
//
// Construction is LAZY (via getAnthropic, not a top-level instance). The SDK
// constructor throws immediately if ANTHROPIC_API_KEY is unset — constructing
// at module load would crash any route that imports this on a machine without
// the key. Deferring construction to call time lets that error be caught where
// it happens (e.g. token counting falls back to an estimate instead of 500ing
// the whole upload). The key comes from .env.local in dev; see
// .env.local.example.
//
// Memoized on globalThis for the same reason as the Prisma client: Next.js
// hot-reload re-evaluates modules and would otherwise build a new client each
// time. In production the module is evaluated once.

const globalForAnthropic = globalThis as unknown as {
  anthropic: Anthropic | undefined;
  anthropicProvider: AnthropicProvider | undefined;
};

export function getAnthropic(): Anthropic {
  if (!globalForAnthropic.anthropic) {
    globalForAnthropic.anthropic = new Anthropic();
  }
  return globalForAnthropic.anthropic;
}

/**
 * Pinned Claude model IDs, verified against live Anthropic docs (2026-06).
 * The mock "OPUS 4.5" / "SONNET 4.5" labels in the design handoff were
 * placeholders — these are the real, current IDs.
 *
 * Modular by design (locked decision): a single registry keyed by role rather
 * than IDs hardcoded at call sites, so a *later* phase can swap models or let a
 * user bring their own model/provider without touching any caller. The
 * user-facing override feature itself is out of scope here — only this shape.
 */
export type ModelRole = "assistant" | "review";

export const MODELS: Record<ModelRole, string> = {
  assistant: "claude-opus-4-8", // Opus 4.8 — the Assistant tab (reliability over cost)
  review: "claude-sonnet-4-6", // Sonnet 4.6 — Review grid cells (volume work)
};

/** Resolve the pinned model ID for a role. The seam a future override hooks into. */
export function modelFor(role: ModelRole): string {
  return MODELS[role];
}

/**
 * The models the user may pick for Review grid cells (verified against live
 * Anthropic docs + a live tool_choice probe, 2026-10). The server only accepts
 * ids on this list, so a stale or hand-edited browser value can't reach the API.
 * MODELS.review stays the default.
 */
export const REVIEW_MODEL_IDS = [
  "claude-sonnet-4-6",
  "claude-sonnet-5-5",
  "claude-haiku-5-5",
] as const;
export type ReviewModelId = (typeof REVIEW_MODEL_IDS)[number];

// Newer models return a 400 for a FORCED tool_choice ({type: "tool"}); the
// Review route falls back to tool_choice "auto" + the system-prompt
// instruction to call submit_answer for these.
const REJECTS_FORCED_TOOL_CHOICE = new Set<string>(["claude-sonnet-5-5"]);

/** Whether a model accepts tool_choice {type: "tool"} (forced structured output). */
export function supportsForcedToolChoice(modelId: string): boolean {
  return !REJECTS_FORCED_TOOL_CHOICE.has(modelId);
}

/**
 * The model the context meter is measured against. Token counts are
 * model-specific; documents go to the Opus-tier Assistant, so we count against
 * it. Derived from the registry so there is exactly one source of truth.
 */
export const TOKEN_COUNT_MODEL = MODELS.assistant;

/**
 * The AI SDK provider path of the model seam. Routes that stream via the
 * Vercel AI SDK get their LanguageModel from here — never by importing
 * @ai-sdk/anthropic themselves (locked decision: the seam owns both client
 * paths, raw SDK and AI SDK).
 *
 * `apiKey` is the future BYO-key hook (#20): when given, a FRESH provider is
 * built with that key and never memoized (a user's key must not leak into the
 * shared singleton). When omitted, the provider reads ANTHROPIC_API_KEY from
 * the environment lazily at call time and is memoized like getAnthropic().
 * Passing `{}` defers the key read to the first HTTP request — `@ai-sdk/anthropic`
 * reads `ANTHROPIC_API_KEY` inside its request-headers closure, not at
 * construction time.
 */
export function getAnthropicProvider(apiKey?: string): AnthropicProvider {
  if (apiKey !== undefined) {
    return createAnthropic({ apiKey });
  }
  if (!globalForAnthropic.anthropicProvider) {
    globalForAnthropic.anthropicProvider = createAnthropic({});
  }
  return globalForAnthropic.anthropicProvider;
}

/** Resolve a streaming-capable LanguageModel for a role through the seam. */
export function languageModelFor(role: ModelRole, apiKey?: string): ReturnType<AnthropicProvider> {
  return getAnthropicProvider(apiKey)(modelFor(role));
}
