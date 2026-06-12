// The no-RAG context ceiling, shared by every surface that enforces or
// displays it (sidebar meter, Assistant send guard, both API routes) so the
// number can never drift between them. Client-safe: no server imports.
//
// The ceiling is the PRD's hard wall: the whole selected doc set rides every
// call, so past ~180k tokens (leaving room for prompt + response in a 200k
// window) requests are BLOCKED with a clear message — never silently
// truncated. Guards compare stored per-document tokenCounts, which makes them
// approximate (template/strategy overhead isn't counted, some stored counts
// are estimates); the API routes' reactive "prompt is too long" mapping stays
// as the authoritative backstop.

export const CONTEXT_CEILING = 180_000;

/** Fraction of the ceiling at which the UI starts warning. */
export const CEILING_WARN_FRACTION = 0.8;

/** Integer warn threshold — rounded once here so the band edge can't drift
 * by a token if the ceiling ever changes to a value where ×0.8 is inexact. */
export const CEILING_WARN_AT = Math.round(CONTEXT_CEILING * CEILING_WARN_FRACTION);

export type CeilingState = "ok" | "warn" | "over";

export function ceilingState(tokens: number): CeilingState {
  if (tokens > CONTEXT_CEILING) return "over";
  if (tokens >= CEILING_WARN_AT) return "warn";
  return "ok";
}

/** "212.4k" — compact token formatting, shared so every surface names the
 * same number the same way (sidebar meter, block messages, 413 bodies). */
export function compactTokens(tokens: number): string {
  return `${(tokens / 1000).toFixed(1)}k`;
}
const compact = compactTokens;

/**
 * The blocking message for an over-ceiling selection — used verbatim by the
 * Assistant composer (client block) and the chat route's 413 (server block),
 * so the user reads the same explanation wherever it stops them.
 */
export function overCeilingMessage(selectedTokens: number): string {
  return (
    `Selected documents total ~${compact(selectedTokens)} tokens — over the ` +
    `${compact(CONTEXT_CEILING)} context ceiling. Deselect documents to continue.`
  );
}

/** The cell route's 413 for a single oversized document. */
export function docOverCeilingMessage(tokenCount: number): string {
  return (
    `This document is ~${compact(tokenCount)} tokens — over the ` +
    `${compact(CONTEXT_CEILING)} context ceiling. It cannot be reviewed in one call.`
  );
}
