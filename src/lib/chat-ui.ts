// The Assistant tab's client-side message shape and pure view helpers.
//
// The chat route streams text (prose + the machine-readable citation footer)
// and, when the footer parses and verifies, a `data-citations` part carrying
// the full VerifiedAnswer. This module is the single place the UI interprets
// that wire shape — components render what these helpers return and never
// touch the footer protocol directly.

import type { UIMessage } from "ai";
import { parseAssistantFooter, type VerifiedAnswer } from "@/lib/contract";

/** Message-level metadata: timestamps always, token usage once the call finishes. */
export type AssistantMetadata = {
  /** Epoch ms — set by the client for user messages, by the route for assistant ones. */
  createdAt?: number;
  inputTokens?: number;
  outputTokens?: number;
  /** Prompt tokens served from Anthropic's cache (0 until caching lands in #17). */
  cachedInputTokens?: number;
};

/** Custom data parts: the route's `data-citations` part is the whole VerifiedAnswer. */
export type AssistantDataParts = { citations: VerifiedAnswer };

export type AssistantUIMessage = UIMessage<AssistantMetadata, AssistantDataParts>;

/** The server-verified answer attached to an assistant message, or null if none arrived. */
export function verifiedAnswerOf(m: AssistantUIMessage): VerifiedAnswer | null {
  for (const part of m.parts) {
    if (part.type === "data-citations") return part.data;
  }
  return null;
}

/**
 * The prose to render for a message. Assistant text parts contain the raw
 * stream — prose followed by the citation footer — so the footer is stripped
 * with the same tolerant parser the route uses (an unclosed footer mid-stream
 * simply doesn't render). When the verified data part has arrived, its
 * server-stripped `value` wins.
 */
export function displayText(m: AssistantUIMessage): string {
  const answer = verifiedAnswerOf(m);
  if (answer) return answer.value;

  const text = m.parts
    .filter((p) => p.type === "text")
    .map((p) => p.text)
    .join("");
  return m.role === "assistant" ? parseAssistantFooter(text).value : text;
}

/** Dot color band for a confidence value — same thresholds as the Review grid. */
export type ConfidenceTone = "ok" | "warn" | "bad";

export function confidenceTone(confidence: number): ConfidenceTone {
  if (confidence > 0.92) return "ok";
  if (confidence > 0.85) return "warn";
  return "bad";
}

/** "10:42" — the thread's message timestamp format (24h, zero-padded). */
export function formatClock(epochMs: number): string {
  const d = new Date(epochMs);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/**
 * Rough live token count for the streaming indicator (~4 chars/token). Real
 * usage arrives in message metadata when the call finishes; this only feeds
 * the "N tok generated" counter while text is still streaming.
 */
export function estimateTokens(text: string): number {
  return Math.round(text.length / 4);
}

/**
 * The user message an assistant message answered — the nearest user turn
 * before it. "Edit prompt" loads this message into the composer; sending it
 * back with its messageId replaces it and truncates everything after (the
 * locked edit-and-resend decision, native sendMessage behavior).
 */
export function originatingUserMessage(
  messages: AssistantUIMessage[],
  assistantMessageId: string,
): AssistantUIMessage | null {
  const idx = messages.findIndex((m) => m.id === assistantMessageId);
  for (let i = idx - 1; i >= 0; i--) {
    if (messages[i].role === "user") return messages[i];
  }
  return null;
}

/**
 * The user message an in-progress edit still targets, or null when it no
 * longer can. The edited message can vanish between "Edit prompt" and send —
 * e.g. a Regenerate on an EARLIER assistant message truncates the thread past
 * it. Sending a messageId that is no longer in the thread makes sendMessage
 * throw (and the draft would be lost), so the send falls back to appending
 * and the composer drops its "editing" state when this returns null.
 */
export function resolveEditTarget(
  messages: AssistantUIMessage[],
  editingId: string | null,
): string | null {
  if (!editingId) return null;
  return messages.some((m) => m.id === editingId) ? editingId : null;
}

/**
 * The template a send actually uses: the user's edit verbatim, unless it is
 * blank — an empty system prompt can't be sent, so blank falls back to the
 * shipped default (#11 decision; the panel shows a note when this applies).
 */
export function effectiveTemplate(template: string, fallback: string): string {
  return template.trim().length > 0 ? template : fallback;
}

/**
 * "claude-opus-4-8" → "OPUS 4.8" — the TopBar model pill label, derived from
 * the registry id so the pill can never drift from the model actually called.
 * Date-stamp suffixes (8+ digits) are not version segments and are dropped.
 */
export function modelDisplayLabel(modelId: string): string {
  const parts = modelId.replace(/^claude-/, "").split("-");
  const family = (parts[0] ?? modelId).toUpperCase();
  const version = parts
    .slice(1)
    .filter((p) => /^\d{1,3}$/.test(p))
    .join(".");
  return version ? `${family} ${version}` : family;
}
