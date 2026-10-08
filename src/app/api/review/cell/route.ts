import { z } from "zod";
import Anthropic from "@anthropic-ai/sdk";
import { prisma } from "@/lib/prisma";
import { getAnthropic, modelFor } from "@/lib/anthropic";
import { CONTEXT_CEILING, docOverCeilingMessage } from "@/lib/context-ceiling";
import { composeReviewSystemPrompt } from "@/lib/wrapper";
import {
  buildReviewTool,
  RawAnswerSchema,
  clipCitationQuotes,
  REVIEW_TOOL_NAME,
} from "@/lib/contract";
import { verifyAnswer } from "@/lib/citation";

// Anthropic call + Prisma are Node-only — never the Edge runtime.
export const runtime = "nodejs";

// Cell answers are table-cell sized; 2048 is generous headroom for the
// structured tool input while staying single-shot and non-streaming.
const MAX_OUTPUT_TOKENS = 2048;

// ONE cell per call (locked decision): a document and a column prompt.
// systemPromptTemplate is optional transparency parity with the Assistant —
// the grid sends the (possibly user-edited) template; default ships in wrapper.
const BodySchema = z.object({
  docId: z.string().min(1),
  prompt: z.string().min(1),
  systemPromptTemplate: z.string().min(1).optional(),
});

function error(message: string, status: number) {
  return Response.json({ error: message }, { status });
}

export async function POST(request: Request) {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return error("Body must be JSON.", 400);
  }

  const parsed = BodySchema.safeParse(raw);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return error(
      `Invalid request: ${issue.path.join(".") || "body"} — ${issue.message}`,
      400,
    );
  }
  const { docId, prompt, systemPromptTemplate } = parsed.data;

  const doc = await prisma.document.findUnique({ where: { id: docId } });
  if (!doc) return error(`Unknown document id: ${docId}.`, 404);

  // #16 guardrail: an oversized document fails fast and cheap — one HTTP
  // round-trip, no model call (and via the #13 warm-skip, the doc's other
  // cells aren't attempted either). Stored tokenCount is approximate; the
  // reactive 413 mapping below remains the authoritative backstop.
  if (doc.tokenCount > CONTEXT_CEILING) {
    return error(docOverCeilingMessage(doc.tokenCount), 413);
  }

  // CACHE PREFIX (the load-bearing cost lever): tools render first and are
  // deterministic; the system block (template + full doc text + strategy) is
  // byte-identical for every cell against this doc, so the breakpoint on it
  // makes subsequent cells pay ~10% input cost. The varying column prompt is
  // the user message, AFTER the breakpoint. 5-minute TTL (default) — grid
  // runs are bursty; the 1h TTL doubles write cost for no benefit here.
  // NOTE: Sonnet's minimum cacheable prefix is 2048 tokens — smaller docs
  // silently don't cache (full price, no error). Accepted; #17 surfaces it.
  const system = composeReviewSystemPrompt(doc, systemPromptTemplate);

  let message: Anthropic.Message;
  try {
    message = await getAnthropic().messages.create({
      model: modelFor("review"),
      max_tokens: MAX_OUTPUT_TOKENS,
      system: [
        { type: "text", text: system, cache_control: { type: "ephemeral" } },
      ],
      messages: [{ role: "user", content: prompt }],
      tools: [buildReviewTool() as Anthropic.Tool],
      // Forced structured output (decision d5): the model MUST answer by
      // calling submit_answer — no prose path to parse, no agentic loop.
      tool_choice: {
        type: "tool",
        name: REVIEW_TOOL_NAME,
        disable_parallel_tool_use: true,
      },
    });
  } catch (err) {
    if (err instanceof Anthropic.APIError) {
      const msg = err.message;
      if (err.status === 400 && /prompt is too long|context|maximum.*tokens/i.test(msg)) {
        return error(
          "This document exceeds the model's context window — it cannot be reviewed in one call.",
          413,
        );
      }
      if (err.status === 429) {
        return error("Rate limited by the model API — retry shortly.", 429);
      }
      // Debuggable by design (AC): pass the upstream type + message through.
      return error(`Model call failed (${err.status ?? "?"}): ${msg}`, 502);
    }
    throw err; // not an API error — let it surface as a 500
  }

  // Forced tool_choice means a well-behaved response has exactly one
  // submit_answer tool_use block. Anything else (refusal, max_tokens cutoff)
  // is an upstream fault — name the stop_reason so it's debuggable.
  const toolUse = message.content.find(
    (b): b is Anthropic.ToolUseBlock =>
      b.type === "tool_use" && b.name === REVIEW_TOOL_NAME,
  );
  if (!toolUse) {
    return error(
      `Model returned no ${REVIEW_TOOL_NAME} call (stop_reason: ${message.stop_reason}).`,
      502,
    );
  }

  const answer = RawAnswerSchema.safeParse(clipCitationQuotes(toolUse.input));
  if (!answer.success) {
    const issue = answer.error.issues[0];
    // stop_reason is the load-bearing clue (review finding): a max_tokens
    // cutoff truncates the tool input mid-JSON, and without it the message
    // reads like a contract bug when the fix is raising MAX_OUTPUT_TOKENS.
    return error(
      `Model answer parse error: ${issue.path.join(".") || "input"} — ${issue.message} (stop_reason: ${message.stop_reason}).`,
      502,
    );
  }

  // Same server-side verification as the Assistant (one contract, both tabs):
  // quotes checked against the source text, confidence capped on any failure.
  const verified = verifyAnswer(
    answer.data,
    new Map([[doc.id, doc.extractedText]]),
  );

  // usage rides along so #17 (cost + cache surfacing) is pure frontend. Raw-SDK
  // `input_tokens` is the UNCACHED count; total input also includes the two
  // cache fields, which the pricing module bills at their own multipliers.
  return Response.json({
    answer: verified,
    usage: {
      uncachedInputTokens: message.usage.input_tokens,
      cacheReadInputTokens: message.usage.cache_read_input_tokens ?? 0,
      cacheWriteInputTokens: message.usage.cache_creation_input_tokens ?? 0,
      outputTokens: message.usage.output_tokens,
    },
  });
}
