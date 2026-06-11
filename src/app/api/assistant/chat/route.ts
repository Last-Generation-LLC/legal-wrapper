import { z } from "zod";
import {
  convertToModelMessages,
  createUIMessageStream,
  createUIMessageStreamResponse,
  streamText,
  validateUIMessages,
  TypeValidationError,
  type ModelMessage,
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

  // Silently deduplicate repeated docIds (first-occurrence order). Prisma's
  // IN clause deduplicates anyway, so a repeated id would otherwise trip the
  // length check below and 404 on a document that exists.
  const docIds = [...new Set(parsed.data.docIds)];

  // Fetch the selected documents — full text included, the route needs it for
  // both prompt composition and citation verification. Selection order is
  // re-imposed below (findMany returns arbitrary order).
  const docs = await prisma.document.findMany({
    where: { id: { in: docIds } },
  });
  if (docs.length !== docIds.length) {
    const found = new Set(docs.map((d) => d.id));
    const missing = docIds.filter((id) => !found.has(id));
    return error(`Unknown document id(s): ${missing.join(", ")}.`, 404);
  }
  const byId = new Map(docs.map((d) => [d.id, d]));
  const ordered = docIds.map((id) => byId.get(id)!);

  // The COMPLETE prompt: user-editable template (docs filled) + citation
  // strategy, fixed order, nothing else. What the user sees in the prompt
  // panel is exactly this.
  const system = composeAssistantSystemPrompt(
    ordered,
    parsed.data.systemPromptTemplate,
  );
  const docTextById = new Map(ordered.map((d) => [d.id, d.extractedText]));

  // Conversion can throw even after validateUIMessages passes — a history
  // part the model API can't accept is a client-content problem, so keep the
  // structured-400 contract rather than leaking an opaque 500.
  let modelMessages: ModelMessage[];
  try {
    modelMessages = await convertToModelMessages(messages);
  } catch {
    return error("messages could not be converted for the model.", 400);
  }

  const stream = createUIMessageStream({
    execute: async ({ writer }) => {
      const result = streamText({
        model: languageModelFor("assistant"),
        system,
        messages: modelMessages,
        maxOutputTokens: MAX_OUTPUT_TOKENS,
        // Single-shot by construction: no tools, no stopWhen/steps.
      });
      writer.merge(result.toUIMessageStream());

      // `result.text` resolves when generation completes, and (verified
      // against ai@6.0.202: createUIMessageStream pushes this execute promise
      // into `ongoingStreamPromises` and only closes the controller after all
      // of them settle) the response stream stays open until this function
      // returns — so the data part below can never lose a race with stream
      // close. Writing from streamText's onFinish had exactly that race: the
      // merged stream could complete and close the response before onFinish's
      // write landed.
      let text: string;
      try {
        text = await result.text;
      } catch {
        // result.text rejects on stream errors / no output (verified in the
        // SDK source: `_steps.reject`). The merged UI stream already carried
        // an error part through onError below; rethrowing here would enqueue
        // a duplicate. Degrade silently: no data part.
        return;
      }

      // The full text exists; parse the footer and verify every quote against
      // the source documents. A missing or malformed footer degrades to
      // prose-only (locked decision) — we simply don't write the data part.
      const { value, footer } = parseAssistantFooter(text);
      if (!footer) return;
      // Attach the FULL VerifiedAnswer (locked decision): `value` is the
      // footer-stripped prose, `citations` carry verified flags + derived
      // pages, `confidence` is possibly downgraded. #10 reads this part
      // from message.parts and can render the clean prose from `value`
      // without re-parsing.
      writer.write({
        type: "data-citations",
        data: verifyAnswer({ value, ...footer }, docTextById),
      });
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
