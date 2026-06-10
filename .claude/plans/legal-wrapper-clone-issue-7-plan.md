# Anthropic Client + Wrapper System Prompt Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Provide the server-side wrapper building blocks — a modular model-ID registry, the tuned default legal system prompt with a `{{DOCUMENTS}}` token, and a pure composer that fills that token with selected-document text.

**Architecture:** Extend the existing `src/lib/anthropic.ts` (lazy client from #5) with a `MODELS` registry keyed by role (`assistant`/`review`), designed as a single swappable config object so a later phase can let users change models/providers without touching call sites. Add a new pure module `src/lib/wrapper.ts` holding the `DEFAULT_SYSTEM_PROMPT` constant and `composeSystemPrompt(docs, template)`, which renders each `Document` as a delimited block and substitutes it for `{{DOCUMENTS}}` (appending at the end if an edited template omits the token). Token counting already exists in `src/lib/tokens.ts` (#5) and is reused as-is.

**Tech Stack:** TypeScript, Next.js 16, `@anthropic-ai/sdk`, Prisma (`Document` type), Vitest.

---

## Scope

**In scope (this task):** model registry + accessor in `anthropic.ts`; `DEFAULT_SYSTEM_PROMPT`, the `{{DOCUMENTS}}` token constant, a token-presence predicate, the document renderer, and the pure `composeSystemPrompt` in `wrapper.ts`; unit tests for all of it.

**Out of scope (deferred to later tasks, per the locked Decisions):** the Assistant chat API / streaming call, the editable system-prompt UI panel (which will *display* the missing-token warning), the citation+confidence output contract, Review-grid prompt caching, and any user-facing model-override feature (only the modular *shape* is built now).

## File Structure

- `src/lib/anthropic.ts` — **modify.** Add `ModelRole` type, `MODELS` registry, `modelFor()` accessor; redefine `TOKEN_COUNT_MODEL` as `MODELS.assistant` so there is one source of truth. Keep `getAnthropic()` untouched.
- `src/lib/wrapper.ts` — **create.** `DOCUMENTS_TOKEN`, `DEFAULT_SYSTEM_PROMPT`, `templateHasDocumentsToken()`, `renderDocuments()`, `composeSystemPrompt()`. Pure functions only — no I/O, no client calls — so they are trivially unit-testable.
- `src/lib/anthropic.test.ts` — **create.** Asserts the pinned IDs and the single-source-of-truth wiring.
- `src/lib/wrapper.test.ts` — **create.** Covers rendering, token substitution, the missing-token append, and the literal-replacement regression guard.
- `src/lib/tokens.ts` — **no change.** Already satisfies "token counting available for context-meter accuracy"; it imports `TOKEN_COUNT_MODEL`, which keeps working after the redefinition.

---

### Task 1: Modular model registry in `anthropic.ts`

**Files:**
- Modify: `src/lib/anthropic.ts`
- Test: `src/lib/anthropic.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// src/lib/anthropic.test.ts
import { describe, it, expect } from "vitest";
import { MODELS, modelFor, TOKEN_COUNT_MODEL } from "@/lib/anthropic";

describe("model registry", () => {
  it("pins the verified Assistant (Opus) and Review (Sonnet) model IDs", () => {
    // Verified against live Anthropic docs 2026-06; mock "4.5" labels were placeholders.
    expect(MODELS.assistant).toBe("claude-opus-4-8");
    expect(MODELS.review).toBe("claude-sonnet-4-6");
  });

  it("exposes a role accessor", () => {
    expect(modelFor("assistant")).toBe("claude-opus-4-8");
    expect(modelFor("review")).toBe("claude-sonnet-4-6");
  });

  it("derives the token-count model from the registry (single source of truth)", () => {
    // The context meter measures against the Assistant model; keep one definition.
    expect(TOKEN_COUNT_MODEL).toBe(MODELS.assistant);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run src/lib/anthropic.test.ts`
Expected: FAIL — `MODELS` / `modelFor` are not exported yet.

- [ ] **Step 3: Add the registry to `anthropic.ts`**

Replace the existing `TOKEN_COUNT_MODEL` export block (the final `export const TOKEN_COUNT_MODEL = "claude-opus-4-8";` and its doc comment) with the registry below. Leave the `getAnthropic()` function and its comments unchanged.

```typescript
/**
 * Pinned Claude model IDs, verified against live Anthropic docs (2026-06).
 * The mock "OPUS 4.5" / "SONNET 4.5" labels in the design handoff were
 * placeholders — these are the real, current IDs.
 *
 * Modular by design (locked decision): a single registry keyed by role rather
 * than IDs hardcoded at call sites, so a *later* phase can swap models or let a
 * user bring their own model/provider without touching any caller. The
 * user-facing override feature itself is out of scope here — only this shape.
 */
export type ModelRole = "assistant" | "review";

export const MODELS: Record<ModelRole, string> = {
  assistant: "claude-opus-4-8", // Opus 4.8 — the Assistant tab (reliability over cost)
  review: "claude-sonnet-4-6", // Sonnet 4.6 — Review grid cells (volume work)
};

/** Resolve the pinned model ID for a role. The seam a future override hooks into. */
export function modelFor(role: ModelRole): string {
  return MODELS[role];
}

/**
 * The model the context meter is measured against. Token counts are
 * model-specific; documents go to the Opus-tier Assistant, so we count against
 * it. Derived from the registry so there is exactly one source of truth.
 */
export const TOKEN_COUNT_MODEL = MODELS.assistant;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run src/lib/anthropic.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Confirm the existing token module still typechecks**

Run: `pnpm exec tsc --noEmit`
Expected: clean — `src/lib/tokens.ts` imports `TOKEN_COUNT_MODEL`, whose value is unchanged (`"claude-opus-4-8"`), so nothing downstream breaks.

- [ ] **Step 6: Commit**

```bash
git add src/lib/anthropic.ts src/lib/anthropic.test.ts
git commit -m "feat: add modular model registry (Opus assistant / Sonnet review)"
```

---

### Task 2: Default prompt, token constant, and presence predicate in `wrapper.ts`

**Files:**
- Create: `src/lib/wrapper.ts`
- Test: `src/lib/wrapper.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// src/lib/wrapper.test.ts
import { describe, it, expect } from "vitest";
import {
  DOCUMENTS_TOKEN,
  DEFAULT_SYSTEM_PROMPT,
  templateHasDocumentsToken,
} from "@/lib/wrapper";

describe("default prompt + token", () => {
  it("uses {{DOCUMENTS}} as the token", () => {
    expect(DOCUMENTS_TOKEN).toBe("{{DOCUMENTS}}");
  });

  it("ships the mock contract-review prompt containing the token", () => {
    expect(DEFAULT_SYSTEM_PROMPT).toContain(
      "You are a contract review assistant for an in-house legal team.",
    );
    expect(DEFAULT_SYSTEM_PROMPT).toContain(DOCUMENTS_TOKEN);
  });
});

describe("templateHasDocumentsToken", () => {
  it("detects the token's presence", () => {
    expect(templateHasDocumentsToken("a {{DOCUMENTS}} b")).toBe(true);
    expect(templateHasDocumentsToken("no token here")).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run src/lib/wrapper.test.ts`
Expected: FAIL — `@/lib/wrapper` does not exist.

- [ ] **Step 3: Create `wrapper.ts` with the constants and predicate**

```typescript
// src/lib/wrapper.ts
import type { Document } from "@prisma/client";

/**
 * The literal token in the system prompt that the composer replaces with the
 * full text of the selected documents at send time.
 */
export const DOCUMENTS_TOKEN = "{{DOCUMENTS}}";

/**
 * The shipped default system prompt — adopted verbatim from the design mock
 * (`design_handoff_legal_wrapper/components/assistant.jsx`, `DEFAULT_SYS_PROMPT`).
 * It is editable at runtime (the transparency thesis), so this only needs to be
 * a strong starting point. The trailing `{{DOCUMENTS}}` is filled per call.
 */
export const DEFAULT_SYSTEM_PROMPT = `You are a contract review assistant for an in-house legal team.

# Behavior
- Ground every factual claim in the attached documents. If a document does not address a point, say so explicitly.
- Prefer concrete clause references (section number, page) over summaries.
- When comparing documents, structure the response as a numbered list of material differences.
- Do not hedge with "I am not a lawyer." The user is a lawyer.
- Do not suggest consulting counsel. The user is counsel.

# Output
- Plain prose. Short paragraphs. Bold for the top-line finding of each numbered point.
- Cite as [DocName §X, p.N]. No hallucinated page numbers — only cite what you can locate.

# Attached documents
${DOCUMENTS_TOKEN}`;

/** True when a (possibly user-edited) template still contains the token. */
export function templateHasDocumentsToken(template: string): boolean {
  return template.includes(DOCUMENTS_TOKEN);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run src/lib/wrapper.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/wrapper.ts src/lib/wrapper.test.ts
git commit -m "feat: add default legal system prompt + token predicate"
```

---

### Task 3: Document renderer (`renderDocuments`)

**Files:**
- Modify: `src/lib/wrapper.ts`
- Test: `src/lib/wrapper.test.ts`

Renders the selected documents into the delimited block specified by the locked decision: `===== DOCUMENT: <name> =====` (name = `title` if present, else `filename`) followed by the full `extractedText`, blocks joined by a blank line in selection order.

- [ ] **Step 1: Write the failing test**

Add to `src/lib/wrapper.test.ts`. The `doc()` factory builds a full `Document` (every column) so the renderer is tested against the real Prisma shape; only the fields the renderer reads vary.

```typescript
import { renderDocuments } from "@/lib/wrapper";
import type { Document } from "@prisma/client";

function doc(over: Partial<Document>): Document {
  return {
    id: "d_test",
    filename: "file.pdf",
    title: null,
    mimeType: "application/pdf",
    extractedText: "body",
    tokenCount: 0,
    tokenCountEstimated: false,
    createdAt: new Date("2026-06-10T00:00:00Z"),
    ...over,
  };
}

describe("renderDocuments", () => {
  it("renders a single doc with the delimited header and full text", () => {
    const out = renderDocuments([
      doc({ filename: "msa.pdf", title: null, extractedText: "MSA text here" }),
    ]);
    expect(out).toBe("===== DOCUMENT: msa.pdf =====\nMSA text here");
  });

  it("prefers title over filename when title is present", () => {
    const out = renderDocuments([
      doc({ filename: "msa.pdf", title: "Master Services Agreement", extractedText: "x" }),
    ]);
    expect(out).toContain("===== DOCUMENT: Master Services Agreement =====");
  });

  it("falls back to filename when title is blank/whitespace", () => {
    const out = renderDocuments([
      doc({ filename: "nda.docx", title: "   ", extractedText: "y" }),
    ]);
    expect(out).toContain("===== DOCUMENT: nda.docx =====");
  });

  it("joins multiple docs with a blank line, preserving order", () => {
    const out = renderDocuments([
      doc({ filename: "a.pdf", extractedText: "AAA" }),
      doc({ filename: "b.pdf", extractedText: "BBB" }),
    ]);
    expect(out).toBe(
      "===== DOCUMENT: a.pdf =====\nAAA\n\n===== DOCUMENT: b.pdf =====\nBBB",
    );
  });

  it("returns an empty string for no docs", () => {
    expect(renderDocuments([])).toBe("");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run src/lib/wrapper.test.ts`
Expected: FAIL — `renderDocuments` is not exported.

- [ ] **Step 3: Implement `renderDocuments`**

Add to `src/lib/wrapper.ts`:

```typescript
/** Display name for a document: its title if set, otherwise its filename. */
function documentName(doc: Pick<Document, "filename" | "title">): string {
  return doc.title && doc.title.trim().length > 0 ? doc.title : doc.filename;
}

/**
 * Render the selected documents into the block that replaces `{{DOCUMENTS}}`.
 * Each doc becomes `===== DOCUMENT: <name> =====` then its full extracted text;
 * blocks are joined by a blank line in selection order.
 */
export function renderDocuments(docs: Document[]): string {
  return docs
    .map((d) => `===== DOCUMENT: ${documentName(d)} =====\n${d.extractedText}`)
    .join("\n\n");
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run src/lib/wrapper.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/wrapper.ts src/lib/wrapper.test.ts
git commit -m "feat: render selected documents into the delimited block"
```

---

### Task 4: The composer (`composeSystemPrompt`)

**Files:**
- Modify: `src/lib/wrapper.ts`
- Test: `src/lib/wrapper.test.ts`

Pure function `(docs: Document[], template = DEFAULT_SYSTEM_PROMPT) => string`. When the template contains `{{DOCUMENTS}}`, replace every occurrence with the rendered block. When it does not (an edited prompt that dropped the token), append the block at the end under an `# Attached documents` heading — never silently drop the docs (locked decision). Surfacing a *warning* to the user is the future UI panel's job; callers detect the condition with `templateHasDocumentsToken()`.

- [ ] **Step 1: Write the failing test**

Add to `src/lib/wrapper.test.ts`:

```typescript
import { composeSystemPrompt, DEFAULT_SYSTEM_PROMPT } from "@/lib/wrapper";

describe("composeSystemPrompt", () => {
  it("substitutes the rendered block for the token using the default template", () => {
    const out = composeSystemPrompt([doc({ filename: "a.pdf", extractedText: "AAA" })]);
    expect(out).not.toContain("{{DOCUMENTS}}"); // token consumed
    expect(out).toContain("===== DOCUMENT: a.pdf =====\nAAA");
    expect(out).toContain("You are a contract review assistant"); // rest of prompt intact
  });

  it("uses a caller-supplied template (the editable-panel path)", () => {
    const out = composeSystemPrompt(
      [doc({ filename: "a.pdf", extractedText: "AAA" })],
      "Custom prompt.\n{{DOCUMENTS}}",
    );
    expect(out).toBe("Custom prompt.\n===== DOCUMENT: a.pdf =====\nAAA");
  });

  it("appends the documents block when an edited template omits the token", () => {
    const out = composeSystemPrompt(
      [doc({ filename: "a.pdf", extractedText: "AAA" })],
      "Edited prompt with no token.",
    );
    expect(out).toBe(
      "Edited prompt with no token.\n\n# Attached documents\n===== DOCUMENT: a.pdf =====\nAAA",
    );
  });

  it("treats the document text literally (no $-pattern substitution)", () => {
    // Regression guard: String.replace/replaceAll honor $&, $1, $$ in the
    // replacement string. The composer must use literal substitution so a
    // document containing "$&" is preserved verbatim.
    const out = composeSystemPrompt(
      [doc({ filename: "a.pdf", extractedText: "price is $5 & rising $& done" })],
      "{{DOCUMENTS}}",
    );
    expect(out).toContain("price is $5 & rising $& done");
  });

  it("replaces an empty selection with an empty block", () => {
    const out = composeSystemPrompt([], "before {{DOCUMENTS}} after");
    expect(out).toBe("before  after");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run src/lib/wrapper.test.ts`
Expected: FAIL — `composeSystemPrompt` is not exported.

- [ ] **Step 3: Implement `composeSystemPrompt`**

Add to `src/lib/wrapper.ts`. Use `split().join()` rather than `String.replace`/`replaceAll` for **literal** substitution — `replace`-family functions interpret `$&`, `$1`, `$$` in the replacement string, which would corrupt document text containing those sequences.

```typescript
/**
 * Compose the final system prompt sent to Claude by filling the documents token.
 *
 * Pure and server-side (locked decision). If `template` contains
 * `{{DOCUMENTS}}`, every occurrence is replaced with the rendered block. If it
 * does not (an edited prompt that dropped the token), the block is appended at
 * the end rather than silently lost — callers use `templateHasDocumentsToken`
 * to detect this and surface a warning in the UI.
 *
 * Uses split/join for *literal* replacement; `String.replace`/`replaceAll`
 * would interpret `$&`/`$1`/`$$` in the document text.
 */
export function composeSystemPrompt(
  docs: Document[],
  template: string = DEFAULT_SYSTEM_PROMPT,
): string {
  const block = renderDocuments(docs);
  if (templateHasDocumentsToken(template)) {
    return template.split(DOCUMENTS_TOKEN).join(block);
  }
  return `${template}\n\n# Attached documents\n${block}`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run src/lib/wrapper.test.ts`
Expected: PASS (all wrapper tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/wrapper.ts src/lib/wrapper.test.ts
git commit -m "feat: compose system prompt by filling the documents token"
```

---

### Task 5: Full verification

**Files:** none (verification only).

- [ ] **Step 1: Run the whole test suite**

Run: `pnpm test`
Expected: PASS — the new `anthropic.test.ts` + `wrapper.test.ts` plus the existing `extract`/`tokens`/`route` suites from #5.

- [ ] **Step 2: Typecheck**

Run: `pnpm exec tsc --noEmit`
Expected: clean.

- [ ] **Step 3: Lint the new files**

Run: `pnpm exec eslint src/lib/anthropic.ts src/lib/wrapper.ts src/lib/anthropic.test.ts src/lib/wrapper.test.ts`
Expected: clean.

- [ ] **Step 4: Build**

Run: `pnpm build`
Expected: `Compiled successfully`. (No new routes; this task ships library code consumed by later tasks.)

---

## Acceptance-criteria coverage

- *Anthropic SDK client configured from `ANTHROPIC_API_KEY`* → already provided by `getAnthropic()` (#5), unchanged here.
- *Model IDs verified + pinned in one config location* → Task 1 (`MODELS` registry in `anthropic.ts`).
- *Documented, tuned legal system prompt with `{{DOCUMENTS}}`* → Task 2 (`DEFAULT_SYSTEM_PROMPT`).
- *Server-side composer replaces `{{DOCUMENTS}}` with selected-doc text* → Tasks 3–4 (`renderDocuments` + `composeSystemPrompt`).
- *Token counting available for context-meter accuracy* → already provided by `countTokens` (#5); `TOKEN_COUNT_MODEL` now derives from the registry. No new code (locked decision).
