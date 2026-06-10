import Anthropic from "@anthropic-ai/sdk";

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
};

export function getAnthropic(): Anthropic {
  if (!globalForAnthropic.anthropic) {
    globalForAnthropic.anthropic = new Anthropic();
  }
  return globalForAnthropic.anthropic;
}

/**
 * The model the context meter is measured against. Documents are sent to the
 * Opus-tier Assistant, so we count tokens against it for an accurate meter.
 * Counts are model-specific, so this must match the Assistant's model.
 */
export const TOKEN_COUNT_MODEL = "claude-opus-4-8";
