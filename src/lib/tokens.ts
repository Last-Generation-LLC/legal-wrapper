import { getAnthropic, TOKEN_COUNT_MODEL } from "@/lib/anthropic";

export interface TokenCountResult {
  /** The token count. */
  count: number;
  /**
   * true when `count` is a rough fallback estimate because the live
   * Anthropic count_tokens call failed (missing API key, network error).
   */
  estimated: boolean;
}

// Rough fallback only. English text averages ~4 characters per token, so this
// is a usable-but-imprecise stand-in when the real count is unavailable. It is
// NEVER used when the live API call succeeds — the project's whole thesis is
// not to show users fabricated numbers, so anything counted this way is flagged
// (`estimated: true`) and the UI surfaces it as approximate.
const FALLBACK_CHARS_PER_TOKEN = 4;

function estimateTokens(text: string): number {
  return Math.ceil(text.length / FALLBACK_CHARS_PER_TOKEN);
}

/**
 * Count tokens in `text` using Anthropic's count_tokens endpoint, measured
 * against the Assistant's model. Never use a local tokenizer (e.g. tiktoken)
 * as the primary path — it undercounts Claude tokens by 15-20%+.
 *
 * If the live call fails, returns a flagged char-based estimate instead of
 * throwing, so a transient API problem doesn't block an otherwise-valid
 * upload. The caller persists the `estimated` flag.
 */
export async function countTokens(text: string): Promise<TokenCountResult> {
  try {
    // getAnthropic() throws if ANTHROPIC_API_KEY is unset — caught below and
    // turned into a flagged estimate rather than a hard failure.
    const response = await getAnthropic().messages.countTokens({
      model: TOKEN_COUNT_MODEL,
      messages: [{ role: "user", content: text }],
    });
    return { count: response.input_tokens, estimated: false };
  } catch (err) {
    console.error(
      "count_tokens failed; falling back to a char-based estimate.",
      err,
    );
    return { count: estimateTokens(text), estimated: true };
  }
}
