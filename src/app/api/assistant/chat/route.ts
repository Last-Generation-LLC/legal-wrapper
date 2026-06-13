import { z } from "zod";
import {
  convertToModelMessages,
  createUIMessageStream,
  createUIMessageStreamResponse,
  generateId,
  streamText,
  validateUIMessages,
  MessageConversionError,
  TypeValidationError,
  type ModelMessage,
  type UIMessage,
} from "ai";
import { prisma } from "@/lib/prisma";
import { languageModelFor } from "@/lib/anthropic";
import { appendMessage, getActiveSession, replaceThread } from "@/lib/chat-store";
import { CONTEXT_CEILING, overCeilingMessage } from "@/lib/context-ceiling";
import { composeAssistantSystemPrompt } from "@/lib/wrapper";
import { parseAssistantFooter } from "@/lib/contract";
import { verifyAnswer } from "@/lib/citation";
import { normalizeAssistantUsage, type AssistantUIMessage } from "@/lib/chat-ui";

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

  // #16 guardrail (defense in depth behind the client block): refuse
  // over-ceiling selections BEFORE the model call, while a clean HTTP status
  // is still possible — once streaming starts the response is already 200.
  // Stored tokenCounts make this approximate; the reactive mapStreamError
  // mapping below stays as the authoritative backstop.
  const selectedTokens = ordered.reduce((sum, d) => sum + d.tokenCount, 0);
  if (selectedTokens > CONTEXT_CEILING) {
    return error(overCeilingMessage(selectedTokens), 413);
  }

  // The COMPLETE prompt: user-editable template (docs filled) + citation
  // strategy, fixed order, nothing else. What the user sees in the prompt
  // panel is exactly this.
  const system = composeAssistantSystemPrompt(
    ordered,
    parsed.data.systemPromptTemplate,
  );
  const docTextById = new Map(ordered.map((d) => [d.id, d.extractedText]));

  // PERSISTENCE, write 1 of 2 (#22): sync the active session to the client's
  // array before the model call. The client array is the truth — this single
  // replace-all inherits edit/truncate/regenerate semantics. If the stream
  // later fails, the user's turn is already safe; only the never-finished
  // assistant text is lost on a mid-stream reload.
  const session = await getActiveSession();
  await replaceThread(session.id, messages as AssistantUIMessage[], docIds);

  // Conversion can throw even after validateUIMessages passes — a history
  // part the model API can't accept is a client-content problem, so keep the
  // structured-400 contract rather than leaking an opaque 500. Any other
  // error (SDK-internal bug, unexpected throw) is rethrown so it surfaces as
  // a 500, not a misleading client-fault 400.
  let modelMessages: ModelMessage[];
  try {
    modelMessages = await convertToModelMessages(messages);
  } catch (err) {
    if (MessageConversionError.isInstance(err)) {
      return error("messages could not be converted for the model.", 400);
    }
    throw err;
  }

  // Errors arrive mid-stream (the response is already 200 by then). Map
  // them to a legible message — the context-ceiling case especially, since
  // #15's guardrails don't exist yet. Extracted as a named const so it can
  // be forwarded into toUIMessageStream() and createUIMessageStream() with
  // a consistent type ((error: unknown) => string).
  function mapStreamError(err: unknown): string {
    const msg = err instanceof Error ? err.message : String(err);
    if (/prompt is too long|context|maximum.*tokens/i.test(msg)) {
      return "The selected documents exceed the model's context window. Deselect some documents and try again.";
    }
    return `The model call failed: ${msg}`;
  }

  const stream = createUIMessageStream({
    execute: async ({ writer }) => {
      const result = streamText({
        model: languageModelFor("assistant"),
        // The system prompt rides the messages array (not the `system` param) so
        // it can carry a cache breakpoint; this flag is the SDK's "yes, I meant
        // to do that" — it suppresses the per-request advisory warning.
        allowSystemInMessages: true,
        messages: [
          {
            role: "system",
            content: system,
            // One cache breakpoint on the document-bearing system prompt: turn 2+
            // of a conversation with the same docs/template pays ~10% on these
            // input tokens (5-min ephemeral TTL). Byte-identical across turns, so
            // it's a clean cache prefix. <1024 tokens (e.g. no docs) simply won't
            // cache — no error, cacheWrite stays 0.
            providerOptions: { anthropic: { cacheControl: { type: "ephemeral" } } },
          },
          ...modelMessages,
        ],
        maxOutputTokens: MAX_OUTPUT_TOKENS,
        // Single-shot by construction: no tools, no stopWhen/steps.
      });
      // Forward mapStreamError into toUIMessageStream so that model-level
      // errors (e.g. context-ceiling rejections surfaced as { type: "error" }
      // parts in fullStream) are formatted by the same handler rather than
      // leaking raw SDK messages. toUIMessageStream's onError formats the
      // errorText for each error part it enqueues; without this it defaults
      // to its own getErrorMessage, which returns the raw error string.
      //
      // messageMetadata is invoked on the stream's start and finish events;
      // the client MERGES the two returns (mergeObjects), so the timestamp
      // survives the usage arriving later. cacheReadTokens stays 0/undefined
      // until prompt caching lands (#17).
      writer.merge(
        result.toUIMessageStream<AssistantUIMessage>({
          onError: mapStreamError,
          messageMetadata: ({ part }) => {
            if (part.type === "start") return { createdAt: Date.now() };
            // finish-step carries usage AND providerMetadata (cache-write count).
            // Single-shot → exactly one finish-step.
            if (part.type === "finish-step") {
              return { usage: normalizeAssistantUsage(part.usage, part.providerMetadata) };
            }
          },
        }),
      );

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
        // an error part through mapStreamError above; rethrowing here would
        // enqueue a duplicate. Degrade silently: no data part.
        return;
      }

      // The full text exists; parse the footer and verify every quote against
      // the source documents. A missing or malformed footer degrades to
      // prose-only (locked decision) — we simply don't write the data part.
      const { value, footer } = parseAssistantFooter(text);
      const verified = footer
        ? verifyAnswer({ value, ...footer }, docTextById)
        : null;
      if (verified) {
        // Attach the FULL VerifiedAnswer (locked decision): `value` is the
        // footer-stripped prose, `citations` carry verified flags + derived
        // pages, `confidence` is possibly downgraded. #10 reads this part
        // from message.parts and can render the clean prose from `value`
        // without re-parsing.
        writer.write({ type: "data-citations", data: verified });
      }

      // PERSISTENCE, write 2 of 2 (#22): the finished assistant turn. Built
      // from the same pieces the stream carried — raw text (displayText
      // strips the footer on render), the verified data part, and the same
      // metadata shape messageMetadata emits. The id differs from the
      // client's in-memory id; the next turn's replace-all self-heals that.
      // A persistence failure must NEVER masquerade as a model failure
      // (review finding): the user just watched a complete answer stream in,
      // and a throw here would route through mapStreamError as "The model
      // call failed". Log and move on — the next turn's replace-all heals
      // the missing row.
      try {
        const usage = await result.totalUsage;
        const providerMetadata = await result.providerMetadata;
        await appendMessage(
          session.id,
          {
            id: generateId(),
            role: "assistant",
            parts: [
              { type: "text", text },
              ...(verified ? [{ type: "data-citations" as const, data: verified }] : []),
            ],
            metadata: {
              createdAt: Date.now(),
              usage: normalizeAssistantUsage(usage, providerMetadata),
            },
          },
          messages.length,
        );
      } catch (err) {
        console.error("Failed to persist the finished assistant turn:", err);
      }
    },
    onError: mapStreamError,
  });

  return createUIMessageStreamResponse({ stream });
}
