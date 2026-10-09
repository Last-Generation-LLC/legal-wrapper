// src/lib/pricing.ts
//
// The single source of pricing truth (locked AC: "pricing constants live in one
// config spot, easy to update"). Pure and client-safe: NO server-only imports
// (no @anthropic-ai/sdk, no @ai-sdk/anthropic), so both the Assistant and Review
// client screens can compute cost without pulling the SDK into the browser
// bundle. Rates verified against live Anthropic pricing docs (2026-06).

/** The canonical usage shape both API routes normalize to. Field meanings are
 *  unambiguous here, unlike the two SDKs' raw `inputTokens` (which disagree on
 *  whether cache tokens are included). */
export type TokenUsage = {
  /** Input tokens billed at the full base rate (cache miss / not cacheable). */
  uncachedInputTokens: number;
  /** Input tokens served from cache — billed at 0.1× base input. */
  cacheReadInputTokens: number;
  /** Input tokens written to the cache this call — billed at 1.25× base input (5-min TTL).
   *  Maps from the Anthropic SDK's `cache_creation_input_tokens` (named by billing tier
   *  here, to pair with `cacheReadInputTokens`); route normalizers translate the field. */
  cacheWriteInputTokens: number;
  /** Generated output tokens. */
  outputTokens: number;
};

/** Cache pricing multipliers relative to the base input rate (verified 2026-06).
 *  `5MIN` = the 5-minute ephemeral TTL both routes use (not "5 million"). */
export const CACHE_WRITE_5MIN_MULTIPLIER = 1.25;
export const CACHE_READ_MULTIPLIER = 0.1;

export type ModelPricing = {
  inputPerMTok: number;
  outputPerMTok: number;
  /** A second rate card for long prompts (Haiku 5.5: prompts over 100K tokens
   *  bill every token at the higher rates). Prompt size = all input tokens,
   *  cached or not. */
  longPrompt?: { overInputTokens: number; inputPerMTok: number; outputPerMTok: number };
};

/**
 * Per-model rates in USD per million tokens. Keyed by the exact model id the
 * registry (`@/lib/anthropic` MODELS) resolves — update both together if a
 * model is swapped. Cache-tier rates are DERIVED from these via the multipliers
 * above, so there is exactly one number per (model, tier) to maintain.
 */
export const MODEL_PRICING: Record<string, ModelPricing> = {
  "claude-opus-4-8": { inputPerMTok: 5, outputPerMTok: 25 },
  "claude-sonnet-4-6": { inputPerMTok: 3, outputPerMTok: 15 },
  "claude-sonnet-5-5": { inputPerMTok: 2, outputPerMTok: 10 }, // verified 2026-10
  "claude-haiku-5-5": {
    inputPerMTok: 0.1,
    outputPerMTok: 0.5,
    longPrompt: { overInputTokens: 100_000, inputPerMTok: 0.5, outputPerMTok: 2.5 },
  }, // verified 2026-10
};

/** Dollar cost of one usage record for a given model id. Unknown model → 0
 *  (show no estimate rather than a confidently wrong one). */
export function usageCostUsd(usage: TokenUsage, modelId: string): number {
  const p = MODEL_PRICING[modelId];
  if (!p) return 0;
  const promptTokens =
    usage.uncachedInputTokens + usage.cacheReadInputTokens + usage.cacheWriteInputTokens;
  const card = p.longPrompt && promptTokens > p.longPrompt.overInputTokens ? p.longPrompt : p;
  const inRate = card.inputPerMTok / 1_000_000;
  const outRate = card.outputPerMTok / 1_000_000;
  return (
    usage.uncachedInputTokens * inRate +
    usage.cacheReadInputTokens * inRate * CACHE_READ_MULTIPLIER +
    usage.cacheWriteInputTokens * inRate * CACHE_WRITE_5MIN_MULTIPLIER +
    usage.outputTokens * outRate
  );
}

/** Fraction of input tokens served from cache (0..1). 0 when there is no input. */
export function cacheHitRate(usage: TokenUsage): number {
  const input =
    usage.uncachedInputTokens + usage.cacheReadInputTokens + usage.cacheWriteInputTokens;
  return input === 0 ? 0 : usage.cacheReadInputTokens / input;
}

const ZERO_USAGE: TokenUsage = {
  uncachedInputTokens: 0,
  cacheReadInputTokens: 0,
  cacheWriteInputTokens: 0,
  outputTokens: 0,
};

/** Element-wise sum — used for the Review grid's per-run aggregate. */
export function sumUsage(usages: TokenUsage[]): TokenUsage {
  return usages.reduce(
    (acc, u) => ({
      uncachedInputTokens: acc.uncachedInputTokens + u.uncachedInputTokens,
      cacheReadInputTokens: acc.cacheReadInputTokens + u.cacheReadInputTokens,
      cacheWriteInputTokens: acc.cacheWriteInputTokens + u.cacheWriteInputTokens,
      outputTokens: acc.outputTokens + u.outputTokens,
    }),
    { ...ZERO_USAGE },
  );
}

/** "$1.20" at/above $1; "$0.0123" below $1; "<$0.0001" for sub-fraction-of-a-cent;
 *  "$0.00" for an exact zero. The point of the feature is to show the cost is tiny. */
export function formatUsd(dollars: number): string {
  // `<= 0` covers an exact zero and any negative (a negative cost is a caller bug;
  // render it harmlessly rather than emitting a "-$…" string).
  if (dollars <= 0) return "$0.00";
  if (dollars < 0.0001) return "<$0.0001";
  if (dollars < 1) return `$${dollars.toFixed(4)}`;
  return `$${dollars.toFixed(2)}`;
}

/** Formatted dollar cost for a usage record, or `undefined` when the model has
 *  no known pricing — callers hide the cost indicator rather than render a
 *  misleading "$0.00" (e.g. a future BYO model not yet in MODEL_PRICING). */
export function formatUsageCost(usage: TokenUsage, modelId: string): string | undefined {
  if (!MODEL_PRICING[modelId]) return undefined;
  return formatUsd(usageCostUsd(usage, modelId));
}

/** "$3 / $15" — a model's base input/output rate per million tokens, for pickers. */
export function formatRateCard(modelId: string): string | undefined {
  const p = MODEL_PRICING[modelId];
  if (!p) return undefined;
  const fmt = (n: number) => `$${n < 1 ? n.toFixed(2) : n}`;
  return `${fmt(p.inputPerMTok)} / ${fmt(p.outputPerMTok)}`;
}

/** "88%" — whole-percent cache-hit label. */
export function formatCachePct(rate: number): string {
  return `${Math.round(rate * 100)}%`;
}
