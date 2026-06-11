import { z } from "zod";
import {
  convertToModelMessages,
  createUIMessageStream,
  createUIMessageStreamResponse,
  streamText,
  validateUIMessages,
  TypeValidationError,
  type UIMessage,
} from "ai";
import { prisma } from "@/lib/prisma";
import { languageModelFor } from "@/lib/anthropic";
import { composeAssistantSystemPrompt } from "@/lib/wrapper";
import { parseAssistantFooter } from "@/lib/contract";
import { verifyAnswer } from "@/lib/citation";

// The Anthropic call and Prisma are Node-only — never the Edge runtime.
export const runtime = "nodejs";

// Locked decision: single-shot Opus, bounded output, default temperature.
const MAX_OUTPUT_TOKENS = 4096;

// docIds may be EMPTY (locked decision: chat without documents is allowed).
// messages are only shallow-checked here; validateUIMessages does the deep
// structural validation below with a precise error.
const BodySchema = z.object({
  docIds: z.array(z.string().min(1)),
  systemPromptTemplate: z.string().min(1),
  messages: z.array(z.unknown()).min(1),
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

  let messages: UIMessage[];
  try {
    messages = await validateUIMessages({
      messages: parsed.data.messages,
    });
  } catch (err) {
    if (err instanceof TypeValidationError) {
      return error("messages is not a valid UIMessage array.", 400);
    }
    throw err;
  }

  // Fetch the selected documents — full text included, the route needs it for
  // both prompt composition and citation verification. Selection order is
  // re-imposed below (findMany returns arbitrary order).
  const docs = await prisma.document.findMany({
    where: { id: { in: parsed.data.docIds } },
  });
  if (docs.length !== parsed.data.docIds.length) {
    const found = new Set(docs.map((d) => d.id));
    const missing = parsed.data.docIds.filter((id) => !found.has(id));
    return error(`Unknown document id(s): ${missing.join(", ")}.`, 404);
  }
  const byId = new Map(docs.map((d) => [d.id, d]));
  const ordered = parsed.data.docIds.map((id) => byId.get(id)!);

  // The COMPLETE prompt: user-editable template (docs filled) + citation
  // strategy, fixed order, nothing else. What the user sees in the prompt
  // panel is exactly this.
  const system = composeAssistantSystemPrompt(
    ordered,
    parsed.data.systemPromptTemplate,
  );
  const docTextById = new Map(ordered.map((d) => [d.id, d.extractedText]));

  const modelMessages = await convertToModelMessages(messages);

  const stream = createUIMessageStream({
    execute: ({ writer }) => {
      const result = streamText({
        model: languageModelFor("assistant"),
        system,
        messages: modelMessages,
        maxOutputTokens: MAX_OUTPUT_TOKENS,
        // Single-shot by construction: no tools, no stopWhen/steps.
        onFinish({ text }) {
          // The stream is done; now the full text exists. Parse the footer
          // and verify every quote against the source documents. A missing
          // or malformed footer degrades to prose-only (locked decision) —
          // we simply don't write the data part.
          const { value, footer } = parseAssistantFooter(text);
          if (!footer) return;
          // Attach the FULL VerifiedAnswer (locked decision): `value` is the
          // footer-stripped prose, `citations` carry verified flags + derived
          // pages, `confidence` is possibly downgraded. #10 reads this part
          // from message.parts and can render the clean prose from `value`
          // without re-parsing.
          const verified = verifyAnswer({ value, ...footer }, docTextById);
          writer.write({
            type: "data-citations",
            data: verified,
          });
        },
      });
      writer.merge(result.toUIMessageStream());
    },
    // Errors arrive mid-stream (the response is already 200 by then). Map
    // them to a legible message — the context-ceiling case especially, since
    // #15's guardrails don't exist yet.
    onError: (err) => {
      const msg = err instanceof Error ? err.message : String(err);
      if (/prompt is too long|context|maximum.*tokens/i.test(msg)) {
        return "The selected documents exceed the model's context window. Deselect some documents and try again.";
      }
      return `The model call failed: ${msg}`;
    },
  });

  return createUIMessageStreamResponse({ stream });
}
