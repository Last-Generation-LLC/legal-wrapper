# Assistant Chat API (Streaming, Opus) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build `POST /api/assistant/chat` — the streaming Assistant route that composes the transparent system prompt with selected document text, makes a single-shot Opus call via the Vercel AI SDK, streams tokens to the client, and attaches server-verified citations + confidence as a structured data part.

**Architecture:** The route is thin wiring over four existing, tested libs: `anthropic.ts` (model seam), `wrapper.ts` (prompt composition), `contract.ts` (footer protocol), `citation.ts` (anti-fabrication verification). The model streams prose followed by a delimited JSON footer; when the stream finishes server-side we parse the footer, verify every quote against the source documents, and write the verified result onto the same UI message stream as a `data-citations` part that #10's `useChat` reads from `message.parts`. The route is stateless — the client sends the full message history each call; it never writes to the database.

**Tech Stack:** Next.js 16 App Router route handler (`runtime = "nodejs"`), **Vercel AI SDK v6** (`ai@^6.0.202`, `@ai-sdk/anthropic@^3.0.83` — latest stable, per the locked AMENDED deps decision; do NOT install the v7 beta), zod v4, Prisma 6, vitest with `ai/test` mocks (no network in tests).

**Locked decisions this plan implements (from `.claude/epics/mvp/9.md` ## Decisions):** Vercel AI SDK transport (`streamText` + UI message stream, no hand-rolled SSE); citations verified server-side on finish and the full `VerifiedAnswer` attached as a data part; `anthropic.ts` seam owns both client paths with an optional `apiKey` arg for future BYO-key (#20); final prompt = editable template (docs filled) + `assistantPromptStrategy()`, fixed order, nothing else; stateless route (persistence is #21); `POST /api/assistant/chat` with zod body `{ docIds, systemPromptTemplate, messages }`, `{ error }` shape, `runtime = "nodejs"`; `modelFor("assistant")` = claude-opus-4-8, single-shot, NO tools, `maxOutputTokens` 4096, default temperature; empty `docIds` allowed (no 400); missing/malformed footer degrades to prose-only (never an error); mid-stream context-limit errors surface as a legible message via the stream's error path; root `pnpm install` required after merge.

**Verified API surfaces (context7, AI SDK v6 docs, 2026-06-11):** `streamText({ model, system, messages, maxOutputTokens, onFinish })`; `createUIMessageStream({ execute: ({ writer }) => …, onError })` with `writer.write({ type: "data-citations", data })` and `writer.merge(result.toUIMessageStream())`; `createUIMessageStreamResponse({ stream })`; `convertToModelMessages(uiMessages)`; `validateUIMessages({ messages })` + `TypeValidationError`; `createAnthropic({ apiKey })` from `@ai-sdk/anthropic`; test helpers `MockLanguageModelV3` (from `ai/test`) and `simulateReadableStream` (from `ai`). If TypeScript disagrees with any of these at implementation time (v6 point releases move), trust the installed package's types and adjust the call site, not the architecture.

---

## File structure

| File | Action | Responsibility |
|---|---|---|
| `package.json` | Modify (pnpm add) | Add `ai` + `@ai-sdk/anthropic` (v6-line latest stable) |
| `src/lib/anthropic.ts` | Modify | Grow the model seam: AI SDK provider path (`getAnthropicProvider`, `languageModelFor`) next to the existing raw `getAnthropic()` |
| `src/lib/anthropic.test.ts` | Modify | Seam tests (modelId resolution, memoization, BYO-key bypass) |
| `src/lib/wrapper.ts` | Modify | `composeAssistantSystemPrompt` — template (docs filled) + strategy, fixed order |
| `src/lib/wrapper.test.ts` | Modify | Composition-order tests |
| `src/app/api/assistant/chat/route.ts` | Create | The route: validate → fetch docs → compose → stream → verify-on-finish |
| `src/app/api/assistant/chat/route.test.ts` | Create | Full route tests with mocked Prisma + mocked language model |

No other files change. The route must NOT import `@ai-sdk/anthropic` directly (locked decision — the seam owns it).

---

### Task 1: Install the AI SDK (v6-line latest stable)

**Files:**
- Modify: `package.json`, `pnpm-lock.yaml` (via pnpm)

- [ ] **Step 1: Add the two packages**

Run from the worktree root:

```bash
pnpm add ai @ai-sdk/anthropic
```

- [ ] **Step 2: Verify what landed is the v6 line (latest stable), not a v7 beta**

```bash
node -e "const p=require('./package.json'); console.log(p.dependencies.ai, p.dependencies['@ai-sdk/anthropic'])"
```

Expected: `^6.x.x ^3.x.x` (e.g. `^6.0.202 ^3.0.83`). If pnpm resolved a `7.0.0-beta` for `ai`, pin explicitly: `pnpm add ai@^6 @ai-sdk/anthropic@^3`.

- [ ] **Step 3: Confirm the project still builds and existing tests pass**

```bash
pnpm test
```

Expected: all existing tests PASS (the new deps are unused so far).

- [ ] **Step 4: Commit**

```bash
git add package.json pnpm-lock.yaml
git commit -m "feat: add Vercel AI SDK (ai + @ai-sdk/anthropic) for the Assistant route"
```

---

### Task 2: Grow the model seam in `anthropic.ts`

The locked seam decision: routes never import `@ai-sdk/anthropic`; they ask this module for a language model by role. The optional `apiKey` parameter is the future BYO-key (#20) hook — when provided, build a fresh provider with that key instead of the memoized env-key one.

**Files:**
- Modify: `src/lib/anthropic.ts`
- Test: `src/lib/anthropic.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `src/lib/anthropic.test.ts`:

```ts
import { getAnthropicProvider, languageModelFor } from "@/lib/anthropic";

describe("AI SDK provider seam", () => {
  it("resolves a language model whose modelId matches the role registry", () => {
    const model = languageModelFor("assistant");
    expect(model.modelId).toBe("claude-opus-4-8");
    expect(languageModelFor("review").modelId).toBe("claude-sonnet-4-6");
  });

  it("memoizes the default provider (same instance across calls)", () => {
    expect(getAnthropicProvider()).toBe(getAnthropicProvider());
  });

  it("builds a FRESH provider when an explicit apiKey is given (BYO-key hook)", () => {
    // A per-request key must never be cached into the shared singleton.
    const byo = getAnthropicProvider("sk-ant-test-not-real");
    expect(byo).not.toBe(getAnthropicProvider());
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm vitest run src/lib/anthropic.test.ts`
Expected: FAIL — `getAnthropicProvider` / `languageModelFor` are not exported.

- [ ] **Step 3: Implement the seam extension**

Append to `src/lib/anthropic.ts` (and add `anthropicProvider` to the existing `globalForAnthropic` type):

```ts
import { createAnthropic, type AnthropicProvider } from "@ai-sdk/anthropic";
```

Update the existing memo type:

```ts
const globalForAnthropic = globalThis as unknown as {
  anthropic: Anthropic | undefined;
  anthropicProvider: AnthropicProvider | undefined;
};
```

Append:

```ts
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
export function languageModelFor(role: ModelRole, apiKey?: string) {
  return getAnthropicProvider(apiKey)(modelFor(role));
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm vitest run src/lib/anthropic.test.ts`
Expected: PASS (all, including the pre-existing registry tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/anthropic.ts src/lib/anthropic.test.ts
git commit -m "feat: add AI SDK provider path to the anthropic.ts model seam"
```

---

### Task 3: `composeAssistantSystemPrompt` in `wrapper.ts`

The locked transparency decision: the final system prompt is exactly the (possibly user-edited) template with `{{DOCUMENTS}}` filled, then a blank line, then `assistantPromptStrategy()` — fixed order, nothing else, nothing hidden. Putting this in `wrapper.ts` gives the prompt one composition point that both the route (to send) and #11's prompt panel (to display verbatim) can share.

**Files:**
- Modify: `src/lib/wrapper.ts`
- Test: `src/lib/wrapper.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `src/lib/wrapper.test.ts` (it already imports from `@/lib/wrapper`; extend the import list):

```ts
import { composeAssistantSystemPrompt } from "@/lib/wrapper";
import { assistantPromptStrategy } from "@/lib/contract";

describe("composeAssistantSystemPrompt", () => {
  const doc = {
    filename: "msa.pdf",
    title: null,
    extractedText: "The term of this Agreement is five (5) years.",
  } as Document;

  it("is the filled template, then a blank line, then the strategy — nothing else", () => {
    const template = `Custom prompt.\n{{DOCUMENTS}}`;
    const result = composeAssistantSystemPrompt([doc], template);
    const expectedHead = composeSystemPrompt([doc], template);
    expect(result).toBe(`${expectedHead}\n\n${assistantPromptStrategy()}`);
  });

  it("defaults to DEFAULT_SYSTEM_PROMPT when no template is given", () => {
    const result = composeAssistantSystemPrompt([doc]);
    expect(result.startsWith("You are a contract review assistant")).toBe(true);
    expect(result).toContain("The term of this Agreement");
    expect(result.endsWith(assistantPromptStrategy())).toBe(true);
  });

  it("composes with zero documents (empty docIds is allowed)", () => {
    const result = composeAssistantSystemPrompt([], "Prompt.\n{{DOCUMENTS}}");
    expect(result).toContain("Prompt.");
    expect(result.endsWith(assistantPromptStrategy())).toBe(true);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm vitest run src/lib/wrapper.test.ts`
Expected: FAIL — `composeAssistantSystemPrompt` is not exported.

- [ ] **Step 3: Implement**

In `src/lib/wrapper.ts`, add the import at the top:

```ts
import { assistantPromptStrategy } from "@/lib/contract";
```

Append:

```ts
/**
 * The COMPLETE Assistant system prompt: the (possibly user-edited) template
 * with documents filled, then the citation/confidence strategy block.
 * Fixed order, nothing else (locked transparency decision) — the prompt panel
 * (#11) renders exactly these two pieces, so what the user sees is what the
 * model receives. The strategy block is appended (not part of the editable
 * template) so an edit cannot break the footer protocol the route parses.
 */
export function composeAssistantSystemPrompt(
  docs: Document[],
  template: string = DEFAULT_SYSTEM_PROMPT,
): string {
  return `${composeSystemPrompt(docs, template)}\n\n${assistantPromptStrategy()}`;
}
```

(Note: `contract.ts` does not import `wrapper.ts`, so no import cycle.)

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm vitest run src/lib/wrapper.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/wrapper.ts src/lib/wrapper.test.ts
git commit -m "feat: compose the full Assistant system prompt (template + citation strategy)"
```

---

### Task 4: The route — validation, doc fetch, stream, verify-on-finish

One file, but test-first in two passes: (a) the rejection paths, (b) the streaming happy/degraded paths with a mocked model. The route mocks follow the established pattern from `src/lib/documents.test.ts` (`vi.mock("@/lib/prisma")`); the model is mocked by mocking the seam module, so the route's own code runs unmodified.

**Files:**
- Create: `src/app/api/assistant/chat/route.ts`
- Test: `src/app/api/assistant/chat/route.test.ts`

- [ ] **Step 1: Write the failing tests (all paths)**

Create `src/app/api/assistant/chat/route.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Document } from "@prisma/client";
import { simulateReadableStream } from "ai";
import { MockLanguageModelV3 } from "ai/test";
import { FOOTER_OPEN, FOOTER_CLOSE } from "@/lib/contract";

// Mock the Prisma singleton (established pattern — see documents.test.ts).
vi.mock("@/lib/prisma", () => ({
  prisma: { document: { findMany: vi.fn() } },
}));

// Mock the model seam so the route runs against a scripted model, no network.
vi.mock("@/lib/anthropic", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/anthropic")>();
  return { ...original, languageModelFor: vi.fn() };
});

import { prisma } from "@/lib/prisma";
import { languageModelFor } from "@/lib/anthropic";
import { POST } from "./route";

// --- helpers ---------------------------------------------------------------

const DOC: Document = {
  id: "doc1",
  filename: "msa.pdf",
  title: null,
  mimeType: "application/pdf",
  extractedText:
    "The term of this Agreement is five (5) years from the Effective Date.",
  tokenCount: 20,
  tokenCountEstimated: false,
  createdAt: new Date(),
};

/** A minimal valid UIMessage history: one user turn. */
const MESSAGES = [
  {
    id: "m1",
    role: "user",
    parts: [{ type: "text", text: "What is the term?" }],
  },
];

function validBody(overrides: Record<string, unknown> = {}) {
  return {
    docIds: ["doc1"],
    systemPromptTemplate: "You are helpful.\n{{DOCUMENTS}}",
    messages: MESSAGES,
    ...overrides,
  };
}

function request(body: unknown): Request {
  return new Request("http://test/api/assistant/chat", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

/** Script the mocked model to stream the given text in two deltas. */
function scriptModel(fullText: string) {
  const mid = Math.floor(fullText.length / 2);
  vi.mocked(languageModelFor).mockReturnValue(
    new MockLanguageModelV3({
      doStream: async () => ({
        stream: simulateReadableStream({
          chunks: [
            { type: "text-start", id: "t1" },
            { type: "text-delta", id: "t1", delta: fullText.slice(0, mid) },
            { type: "text-delta", id: "t1", delta: fullText.slice(mid) },
            { type: "text-end", id: "t1" },
            {
              type: "finish",
              finishReason: { unified: "stop", raw: undefined },
              logprobs: undefined,
              usage: {
                inputTokens: { total: 10, noCache: 10, cacheRead: undefined, cacheWrite: undefined },
                outputTokens: { total: 20, text: 20, reasoning: undefined },
              },
            },
          ],
        }),
      }),
    }) as unknown as ReturnType<typeof languageModelFor>,
  );
}

// --- tests -------------------------------------------------------------------

describe("POST /api/assistant/chat — rejections", () => {
  beforeEach(() => vi.clearAllMocks());

  it("400 on a non-JSON body", async () => {
    const res = await POST(request("not json {"));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/JSON/);
  });

  it("400 when docIds / systemPromptTemplate / messages are malformed", async () => {
    const res = await POST(request({ docIds: "doc1", systemPromptTemplate: "", messages: [] }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBeTruthy();
  });

  it("400 when messages is not a valid UIMessage array", async () => {
    const res = await POST(
      request(validBody({ messages: [{ bogus: true }] })),
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/message/i);
  });

  it("404 with the missing ids when a docId is unknown", async () => {
    vi.mocked(prisma.document.findMany).mockResolvedValue([]);
    const res = await POST(request(validBody({ docIds: ["nope"] })));
    expect(res.status).toBe(404);
    expect((await res.json()).error).toContain("nope");
  });
});

describe("POST /api/assistant/chat — streaming", () => {
  beforeEach(() => vi.clearAllMocks());

  it("streams the prose and attaches verified citations as a data part", async () => {
    vi.mocked(prisma.document.findMany).mockResolvedValue([DOC]);
    const footer = JSON.stringify({
      citations: [
        // verbatim substring of DOC.extractedText, >= 12 chars
        { docId: "doc1", quote: "term of this Agreement is five (5) years", section: "§1" },
      ],
      confidence: 0.9,
    });
    scriptModel(
      `The term is five years.\n${FOOTER_OPEN}\n${footer}\n${FOOTER_CLOSE}`,
    );

    const res = await POST(request(validBody()));
    expect(res.status).toBe(200);
    const sse = await res.text();

    // prose streamed through
    expect(sse).toContain("The term is five years.");
    // the verified-citations data part rode the same stream, carrying the
    // FULL VerifiedAnswer: footer-stripped prose value + flagged citations
    // + (possibly downgraded) confidence
    expect(sse).toContain("data-citations");
    expect(sse).toContain('"value":"The term is five years."');
    expect(sse).toContain('"verified":true');
    expect(sse).toContain('"confidence":0.9');
  });

  it("degrades to prose-only when the footer is absent (no data part, no error)", async () => {
    vi.mocked(prisma.document.findMany).mockResolvedValue([DOC]);
    scriptModel("The term is five years. No footer here.");

    const res = await POST(request(validBody()));
    expect(res.status).toBe(200);
    const sse = await res.text();
    expect(sse).toContain("No footer here.");
    expect(sse).not.toContain("data-citations");
  });

  it("caps confidence at 0.3 when a quote fails verification", async () => {
    vi.mocked(prisma.document.findMany).mockResolvedValue([DOC]);
    const footer = JSON.stringify({
      citations: [{ docId: "doc1", quote: "this text is not in the document" }],
      confidence: 0.95,
    });
    scriptModel(`Answer.\n${FOOTER_OPEN}\n${footer}\n${FOOTER_CLOSE}`);

    const res = await POST(request(validBody()));
    const sse = await res.text();
    expect(sse).toContain('"verified":false');
    expect(sse).toContain('"confidence":0.3');
  });

  it("allows an empty docIds (chat without documents)", async () => {
    vi.mocked(prisma.document.findMany).mockResolvedValue([]);
    scriptModel("General answer, no documents attached.");

    const res = await POST(request(validBody({ docIds: [] })));
    expect(res.status).toBe(200);
    expect(await res.text()).toContain("General answer");
  });

  it("sends the composed system prompt: filled template then strategy block", async () => {
    vi.mocked(prisma.document.findMany).mockResolvedValue([DOC]);
    scriptModel("ok");

    await POST(request(validBody()));

    // The mocked model captured the call; the system prompt must contain the
    // rendered document block AND the citation strategy, in that order.
    const mock = vi.mocked(languageModelFor).mock.results[0]
      .value as MockLanguageModelV3;
    const call = mock.doStreamCalls[0];
    const systemText = JSON.stringify(call.prompt);
    expect(systemText).toContain("===== DOCUMENT: msa.pdf =====");
    expect(systemText).toContain("Citations and confidence");
    expect(
      systemText.indexOf("===== DOCUMENT"),
    ).toBeLessThan(systemText.indexOf("Citations and confidence"));
  });
});
```

(If `doStreamCalls` is named differently in the installed `ai/test` version, check the `MockLanguageModelV3` type — the mock records its calls; use the recorded-calls property TypeScript offers.)

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm vitest run src/app/api/assistant/chat/route.test.ts`
Expected: FAIL — `./route` does not exist.

- [ ] **Step 3: Implement the route**

Create `src/app/api/assistant/chat/route.ts`:

```ts
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
  // preserved (findMany returns arbitrary order).
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
```

- [ ] **Step 4: Run the route tests**

Run: `pnpm vitest run src/app/api/assistant/chat/route.test.ts`
Expected: PASS (all 9). Two likely friction points, both fixable without architecture changes:
- `onFinish`'s payload property for the final text — if `text` isn't it, check the installed `StreamTextOnFinishCallback` type for the final-text field.
- The mock's recorded-calls property name (`doStreamCalls`) — check the `MockLanguageModelV3` type.

- [ ] **Step 5: Run the whole suite (no regressions)**

Run: `pnpm test`
Expected: PASS across the board.

- [ ] **Step 6: Commit**

```bash
git add src/app/api/assistant/chat/
git commit -m "feat: Assistant chat route — streaming Opus with verified-citation data part"
```

---

### Task 5: Verification sweep (build, lint, acceptance, live smoke)

**Files:** none (verification only)

- [ ] **Step 1: Type-check and build**

Run: `pnpm build`
Expected: clean Next.js production build, route listed as `ƒ /api/assistant/chat`.

- [ ] **Step 2: Lint**

Run: `pnpm lint`
Expected: no errors.

- [ ] **Step 3: Live smoke test against the real API (key is configured in `.env.local`)**

Start the dev server (`pnpm dev`) in the background, upload nothing — instead use an existing doc id from the DB, or upload a small PDF via the UI/curl first. Then:

```bash
DOC_ID=$(sqlite3 prisma/dev.db "select id from Document limit 1")
curl -N -s http://localhost:3000/api/assistant/chat \
  -H 'content-type: application/json' \
  -d "{\"docIds\":[\"$DOC_ID\"],\"systemPromptTemplate\":\"You are a contract review assistant.\\n{{DOCUMENTS}}\",\"messages\":[{\"id\":\"m1\",\"role\":\"user\",\"parts\":[{\"type\":\"text\",\"text\":\"Summarize this document in one sentence and cite it.\"}]}]}"
```

Expected: SSE stream of `text-delta` parts (token-by-token prose), then a `data-citations` part with `verified` citations and a `confidence`, then `finish`. If the DB is empty, upload a fixture first: `curl -F file=@<some.pdf> http://localhost:3000/api/upload`.

- [ ] **Step 4: Check the acceptance criteria boxes in `.claude/epics/mvp/9.md`**

All five: doc IDs + edited prompt + history accepted; `{{DOCUMENTS}}` replaced server-side, nothing hidden; token-by-token streaming; citations + confidence per the 007 contract; single-shot, no agent loop.

- [ ] **Step 5: Commit any checkbox/doc updates**

```bash
git add .claude/epics/mvp/9.md
git commit -m "chore: check off #9 acceptance criteria"
```

---

## Post-merge reminder (for /pm:ship, not this branch)

This branch adds dependencies. After `/pm:ship` merges it to main, run `pnpm install` at the repo root or main won't build (recorded project lesson; also a locked risk decision on this task).
