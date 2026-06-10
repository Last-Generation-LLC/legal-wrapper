# Citation + Confidence Output Contract — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the shared, library-level contract both tabs consume — a Zod-defined `{ value, citations[], confidence }` shape, a quote-anchored anti-fabrication guard, a "document-support" confidence that auto-downgrades on a failed citation, and the two emission helpers (forced tool-use for Review, streamed delimited footer for Assistant) — plus the `extract.ts` change that makes page numbers verifiable.

**Architecture:** Two new pure-library modules. `src/lib/contract.ts` owns the data shape (Zod schemas → TS types + a generated JSON Schema for tool-use), the anti-fabrication prompt-strategy text, and the emission helpers. `src/lib/citation.ts` owns the pure verification/confidence functions (quote check, page derivation, confidence downgrade). One change to the existing `src/lib/extract.ts` stops stripping pdf-parse's `-- N of M --` page markers from stored text (decision d2) so page numbers can be derived and verified. No API routes, no UI, no streaming-SDK dependency — the footer parser is plain string work. Consumers (#9 Assistant, #11 Review) wire these in later.

**Tech Stack:** TypeScript, Zod v4 (`z.toJSONSchema` — verified against live docs), `@anthropic-ai/sdk ^0.104.1` (tool shape only — no live call in this task), Vitest 3 (node env), existing `pdf-lib`/`docx` test fixtures.

**Locked decisions this plan honors (from `.claude/epics/mvp/8.md` → `## Decisions`):**
- **d1** verbatim-quote guard (quote must be findable in source text) · **d2** keep page markers in `extract.ts` · **d3** pill carries doc + optional §section + optional page (PDF only) + always the quote · **d4** confidence = "document support", auto-downgraded on any failed citation · **d5** one shape, two emission modes.
- **n3** failed quote → keep-but-flag (`verified:false`), drives the downgrade (not reject). · **n5** any failure caps the **whole answer** confidence at **0.3**. · **n6** forced tool-use (Review) + streamed footer (Assistant), both single-shot. · **n1** module layout `contract.ts` + `citation.ts`. · **n2** define the shape with Zod. · **n4** page derived by scanning back to the nearest `-- N of M --` marker; undefined for DOCX/markerless docs.

**Scope boundary (do NOT build here):** the Assistant chat API (#9), the Review cell API + prompt caching (#11), and any pill/dot rendering (#9/#10/#12/#13). This task delivers the contract library + the `extract.ts` change + tests only.

---

### Task 1: Add Zod and a multi-page PDF fixture

**Files:**
- Modify: `package.json` (add `zod` dependency)
- Modify: `src/test/fixtures.ts`
- Test: `src/test/fixtures.test.ts` (Create)

- [ ] **Step 1: Install Zod**

Run: `pnpm add zod`
Expected: `zod` (v4.x) appears under `dependencies` in `package.json`. Verify it is v4 (the `z.toJSONSchema` API used in Task 5/8 is v4-only): `pnpm list zod` should show `4.x`.

- [ ] **Step 2: Write the failing fixture test**

Create `src/test/fixtures.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { makeMultiPagePdf } from "@/test/fixtures";
import { extractText, PDF_MIME } from "@/lib/extract";

describe("makeMultiPagePdf", () => {
  it("produces a PDF with one page per string", async () => {
    // extractText already reports pageCount, so we can assert the page count
    // without depending on the (Task 2) marker change.
    const buffer = await makeMultiPagePdf(["Page one text", "Page two text"]);
    const result = await extractText(buffer, PDF_MIME);
    expect(result.pageCount).toBe(2);
    expect(result.text).toContain("Page one text");
    expect(result.text).toContain("Page two text");
  });
});
```

- [ ] **Step 3: Run it to verify it fails**

Run: `pnpm exec vitest run src/test/fixtures.test.ts`
Expected: FAIL — `makeMultiPagePdf` is not exported.

- [ ] **Step 4: Add the fixture helper**

In `src/test/fixtures.ts`, add alongside the existing helpers (reuses the same `PDFDocument`/`StandardFonts` imports already at the top of the file):

```ts
/**
 * Build a multi-page PDF — one page per entry in `pages`. An empty string
 * yields a page with no drawn text (used to simulate a scanned/text-less page).
 */
export async function makeMultiPagePdf(pages: string[]): Promise<Buffer> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (const text of pages) {
    const page = doc.addPage([612, 792]);
    if (text.length > 0) page.drawText(text, { x: 50, y: 700, size: 18, font });
  }
  return Buffer.from(await doc.save());
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm exec vitest run src/test/fixtures.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add package.json pnpm-lock.yaml src/test/fixtures.ts src/test/fixtures.test.ts
git commit -m "chore: add zod and a multi-page PDF test fixture"
```

---

### Task 2: Preserve page markers in extraction (decision d2)

**Files:**
- Modify: `src/lib/extract.ts` (the `extractPdf` strip and the `extractText` empty-guard)
- Test: `src/lib/extract.test.ts`

Today `extractPdf` deletes pdf-parse's `-- N of M --` separator lines before returning, and `extractText` decides "empty/scanned" from `result.text.length === 0`. We must keep the markers in the *stored* text (so pages are derivable) while still detecting a text-less PDF — so the empty-check moves to a marker-stripped copy.

- [ ] **Step 1: Write the failing tests**

Add to `src/lib/extract.test.ts` (inside the existing `describe("extractText", …)` block; `makeMultiPagePdf` is now exported from `@/test/fixtures` — add it to the existing fixtures import):

```ts
it("preserves pdf page markers in the stored text (so pages are derivable)", async () => {
  const buffer = await makeMultiPagePdf(["First page body", "Second page body"]);
  const result = await extractText(buffer, PDF_MIME);
  // The page-boundary markers must survive into stored text now.
  expect(result.text).toMatch(/-- 1 of 2 --/);
  expect(result.text).toMatch(/-- 2 of 2 --/);
  expect(result.text).toContain("First page body");
  expect(result.text).toContain("Second page body");
});

it("still rejects a multi-page text-less PDF (markers alone are not content)", async () => {
  // Two blank pages: the only text pdf-parse yields is the page markers.
  // The empty-guard must strip markers before deciding it is empty.
  const buffer = await makeMultiPagePdf(["", ""]);
  await expect(extractText(buffer, PDF_MIME)).rejects.toBeInstanceOf(
    ExtractionError,
  );
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `pnpm exec vitest run src/lib/extract.test.ts`
Expected: FAIL — markers are currently stripped (first test), and the empty-guard would not yet strip markers for the blank-multi-page case (second test).

- [ ] **Step 3: Make the change**

In `src/lib/extract.ts`, stop stripping in `extractPdf` so markers reach storage:

```ts
async function extractPdf(buffer: Buffer): Promise<ExtractionResult> {
  const parser = new PDFParse({ data: buffer });
  try {
    const result = await parser.getText();
    // d2: keep pdf-parse's "-- N of M --" page markers in the STORED text so
    // citation page numbers are derivable/verifiable downstream. The empty
    // guard in extractText() strips them only for its own check.
    const text = result.text.trim();
    return { text, pageCount: result.total };
  } catch (err) {
    throw new ExtractionError(
      "Failed to parse PDF. The file may be corrupt or password-protected.",
      err,
    );
  } finally {
    await parser.destroy();
  }
}
```

Then update the empty-guard in `extractText` to ignore markers when judging emptiness (the existing module-level `PAGE_MARKER` regex is reused):

```ts
  // The empty-extraction guard: a right-typed file that yields no text is
  // almost always a scanned/image-only PDF. Page markers are not content, so
  // strip them before judging emptiness (a marker-only PDF is still "empty").
  const contentOnly = result.text.replace(PAGE_MARKER, "").trim();
  if (contentOnly.length === 0) {
    throw new ExtractionError(
      "No extractable text found. The file may be a scanned image or have no text layer; OCR is not supported.",
    );
  }
```

(Update the existing comment on `PAGE_MARKER` so it reflects that markers are now stripped only for the guard, not for storage.)

- [ ] **Step 4: Run the full extract suite**

Run: `pnpm exec vitest run src/lib/extract.test.ts`
Expected: PASS — new tests pass and the existing single-page / DOCX / corrupt / blank-single-page tests still pass (the single-page guard still fires because a one-page blank PDF's marker-stripped text is empty).

- [ ] **Step 5: Commit**

```bash
git add src/lib/extract.ts src/lib/extract.test.ts
git commit -m "feat: preserve pdf page markers in extracted text

Stop stripping pdf-parse's '-- N of M --' separators from stored text so
citation page numbers become derivable and verifiable (decision d2). The
empty/scanned-PDF guard now strips markers only for its own emptiness check."
```

---

### Task 3: Contract — Zod schemas and types (decisions n1, n2)

**Files:**
- Create: `src/lib/contract.ts`
- Test: `src/lib/contract.test.ts`

`value` is the answer text; `citations[]` are quote-anchored references; `confidence` is the 0–1 document-support score. The model emits a *raw* shape; we later add `verified`/`page` (Task 6). The Assistant's streamed footer carries everything except `value` (the prose is the value), so we derive a footer schema from the answer schema.

- [ ] **Step 1: Write the failing schema tests**

Create `src/lib/contract.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  RawAnswerSchema,
  RawFooterSchema,
  MIN_QUOTE_LENGTH,
} from "@/lib/contract";

describe("RawAnswerSchema", () => {
  const valid = {
    value: "The liability cap is uncapped for confidentiality breaches.",
    citations: [
      { docId: "doc_1", quote: "Liability shall be uncapped for breach of confidentiality", section: "§12" },
    ],
    confidence: 0.82,
  };

  it("accepts a well-formed answer", () => {
    expect(RawAnswerSchema.safeParse(valid).success).toBe(true);
  });

  it("rejects confidence outside 0..1", () => {
    expect(RawAnswerSchema.safeParse({ ...valid, confidence: 1.5 }).success).toBe(false);
    expect(RawAnswerSchema.safeParse({ ...valid, confidence: -0.1 }).success).toBe(false);
  });

  it("rejects a citation with too short / missing a quote", () => {
    const short = "a".repeat(MIN_QUOTE_LENGTH - 1);
    expect(
      RawAnswerSchema.safeParse({ ...valid, citations: [{ docId: "doc_1", quote: short }] }).success,
    ).toBe(false);
    expect(
      RawAnswerSchema.safeParse({ ...valid, citations: [{ docId: "doc_1" }] }).success,
    ).toBe(false);
  });

  it("treats section as optional", () => {
    const noSection = { ...valid, citations: [{ docId: "doc_1", quote: valid.citations[0].quote }] };
    expect(RawAnswerSchema.safeParse(noSection).success).toBe(true);
  });
});

describe("RawFooterSchema", () => {
  it("is the answer shape without value", () => {
    const footer = { citations: [], confidence: 0.5 };
    expect(RawFooterSchema.safeParse(footer).success).toBe(true);
    // value is not part of the footer
    expect(RawFooterSchema.safeParse({ ...footer, value: "x" }).success).toBe(true); // extra key ignored
    expect("value" in RawFooterSchema.parse({ ...footer })).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm exec vitest run src/lib/contract.test.ts`
Expected: FAIL — `@/lib/contract` does not exist.

- [ ] **Step 3: Create the schemas and types**

Create `src/lib/contract.ts`:

```ts
// The shared citation + confidence contract consumed by BOTH tabs.
//
// One shape (`{ value, citations[], confidence }`), two emission modes
// (decision d5): the Review grid forces structured JSON via Anthropic tool-use;
// the Assistant streams prose then appends a delimited JSON footer. This module
// owns the shape, the anti-fabrication prompt strategy, and the emission
// helpers. The pure verification/confidence logic lives in `./citation.ts`.

import * as z from "zod";

/** Quote length bounds — long enough to be a real anchor, short enough to be a snippet. */
export const MIN_QUOTE_LENGTH = 12;
export const MAX_QUOTE_LENGTH = 300;

/** A single supporting citation as emitted by the model (before verification). */
export const RawCitationSchema = z.object({
  docId: z
    .string()
    .min(1)
    .describe("The id of the source document this citation supports."),
  quote: z
    .string()
    .min(MIN_QUOTE_LENGTH)
    .max(MAX_QUOTE_LENGTH)
    .describe(
      "A short VERBATIM quote copied exactly from the source document text — never paraphrased.",
    ),
  section: z
    .string()
    .optional()
    .describe("The section label if identifiable, e.g. §12.3."),
});

/** The full answer shape both tabs produce. */
export const RawAnswerSchema = z.object({
  value: z.string().describe("The answer text for the user."),
  citations: z
    .array(RawCitationSchema)
    .describe("Supporting citations, each a verbatim quote from the documents."),
  confidence: z
    .number()
    .min(0)
    .max(1)
    .describe(
      "How well the attached documents support this answer, in [0,1]. NOT a probability that the answer is correct.",
    ),
});

/** The Assistant footer = the answer shape minus `value` (the prose IS the value). */
export const RawFooterSchema = RawAnswerSchema.omit({ value: true });

export type RawCitation = z.infer<typeof RawCitationSchema>;
export type RawAnswer = z.infer<typeof RawAnswerSchema>;
export type RawFooter = z.infer<typeof RawFooterSchema>;

/** A citation after server-side verification (the shape consumers render). */
export interface VerifiedCitation extends RawCitation {
  /** true when `quote` was found in the cited document's text (decision d1). */
  verified: boolean;
  /** Page number derived from the `-- N of M --` markers; PDF-only, else undefined (d3/n4). */
  page?: number;
}

/** A fully verified answer: annotated citations + a possibly-downgraded confidence. */
export interface VerifiedAnswer {
  value: string;
  citations: VerifiedCitation[];
  confidence: number;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run src/lib/contract.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/contract.ts src/lib/contract.test.ts
git commit -m "feat: define the citation + confidence Zod schema and types"
```

---

### Task 4: Citation — quote verification (decision d1)

**Files:**
- Create: `src/lib/citation.ts`
- Test: `src/lib/citation.test.ts`

The guard: a citation's quote must appear in the cited document's text, compared with whitespace normalized (the source text wraps lines, so exact byte-match would false-fail). Strict substring otherwise — the accepted tradeoff (the strict-substring risk, d10) is false negatives on paraphrase, never false positives.

- [ ] **Step 1: Write the failing tests**

Create `src/lib/citation.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { normalizeWhitespace, verifyCitation } from "@/lib/citation";

describe("normalizeWhitespace", () => {
  it("collapses runs of whitespace and trims", () => {
    expect(normalizeWhitespace("  a\n  b\t c  ")).toBe("a b c");
  });
});

describe("verifyCitation", () => {
  const docText = "The Agreement provides that\nliability shall be uncapped for\nbreach of confidentiality.";

  it("accepts an exact quote (whitespace-insensitive)", () => {
    expect(verifyCitation("liability shall be uncapped for breach", docText)).toBe(true);
  });

  it("rejects a fabricated quote not present in the text", () => {
    expect(verifyCitation("liability is capped at fees paid", docText)).toBe(false);
  });

  it("rejects an empty quote", () => {
    expect(verifyCitation("", docText)).toBe(false);
    expect(verifyCitation("   ", docText)).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm exec vitest run src/lib/citation.test.ts`
Expected: FAIL — `@/lib/citation` does not exist.

- [ ] **Step 3: Implement normalize + verify**

Create `src/lib/citation.ts`:

```ts
// Pure verification + confidence logic for the citation contract (decision n1).
// No I/O, no SDK calls — just functions over strings and the contract types,
// which is what makes the anti-fabrication guard cheaply unit-testable.

import {
  type RawAnswer,
  type VerifiedAnswer,
  type VerifiedCitation,
} from "@/lib/contract";

/** Collapse any run of whitespace to a single space and trim. */
export function normalizeWhitespace(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

/**
 * The anti-fabrication guard (decision d1): the quote must appear verbatim in
 * the document text, compared with whitespace normalized so source line-wraps
 * don't cause false failures. Strict substring otherwise.
 */
export function verifyCitation(quote: string, docText: string): boolean {
  const q = normalizeWhitespace(quote);
  if (q.length === 0) return false;
  return normalizeWhitespace(docText).includes(q);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run src/lib/citation.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/citation.ts src/lib/citation.test.ts
git commit -m "feat: add quote-anchored citation verification"
```

---

### Task 5: Citation — page derivation from markers (decision n4)

**Files:**
- Modify: `src/lib/citation.ts`
- Test: `src/lib/citation.test.ts`

Find where the quote sits in the raw document text, then read the nearest `-- N of M --` marker before it. Whitespace-flexible matching (tokens joined by `\s+`) so the same wrap-tolerance as `verifyCitation` applies. Undefined when the quote isn't found or there are no markers (DOCX, or PDFs uploaded before Task 2).

- [ ] **Step 1: Write the failing tests**

Add to `src/lib/citation.test.ts`:

```ts
import { derivePage } from "@/lib/citation"; // extend the existing import

describe("derivePage", () => {
  const paged = "-- 1 of 2 --\nRecitals and definitions here.\n-- 2 of 2 --\nLiability shall be uncapped for breach.";

  it("returns the page the quote falls under", () => {
    expect(derivePage(paged, "Liability shall be uncapped for breach")).toBe(2);
    expect(derivePage(paged, "Recitals and definitions here")).toBe(1);
  });

  it("returns undefined when the quote is absent", () => {
    expect(derivePage(paged, "no such text anywhere")).toBeUndefined();
  });

  it("returns undefined when there are no page markers (DOCX / pre-existing docs)", () => {
    expect(derivePage("Plain docx text with no markers at all.", "Plain docx text")).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm exec vitest run src/lib/citation.test.ts`
Expected: FAIL — `derivePage` is not exported.

- [ ] **Step 3: Implement page derivation**

Add to `src/lib/citation.ts`:

```ts
/** Escape a string for safe literal use inside a RegExp. */
function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Matches pdf-parse's page markers and captures the page number. Global so we
// can walk every marker in order; not anchored (we scan within the body).
const PAGE_MARKER_GLOBAL = /-- (\d+) of \d+ --/g;

/**
 * Derive the page a quote sits on by locating the quote in the raw document
 * text (whitespace-flexible) and reading the nearest preceding `-- N of M --`
 * marker (decision n4). Returns undefined when the quote can't be located or
 * the text has no markers (DOCX, or PDFs stored before the marker change).
 */
export function derivePage(docText: string, quote: string): number | undefined {
  const tokens = normalizeWhitespace(quote)
    .split(" ")
    .filter((t) => t.length > 0)
    .map(escapeRegExp);
  if (tokens.length === 0) return undefined;

  const flexible = new RegExp(tokens.join("\\s+"));
  const match = flexible.exec(docText);
  if (!match) return undefined;
  const quoteIndex = match.index;

  let page: number | undefined;
  for (const marker of docText.matchAll(PAGE_MARKER_GLOBAL)) {
    if (marker.index <= quoteIndex) page = Number(marker[1]);
    else break; // markers are in document order; past the quote — stop
  }
  return page;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run src/lib/citation.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/citation.ts src/lib/citation.test.ts
git commit -m "feat: derive citation page from preserved page markers"
```

---

### Task 6: Citation — confidence downgrade + verifyAnswer (decisions d4, n3, n5)

**Files:**
- Modify: `src/lib/contract.ts` (export the cap constant), `src/lib/citation.ts`
- Test: `src/lib/citation.test.ts`

Tie it together: annotate every citation with `verified` + `page` (keep-but-flag — n3), and if *any* citation is unverified, cap the **whole answer's** confidence at **0.3** (n5). Unknown `docId` counts as unverified.

- [ ] **Step 1: Export the cap constant from the contract**

Add to `src/lib/contract.ts` (near the other constants):

```ts
/**
 * Confidence cap applied to the WHOLE answer when any citation fails the quote
 * check (decisions n5/d4). Mirrors the tokens.ts honesty ethic: a number we
 * can't stand behind is forced into the low band, never shown at face value.
 */
export const FAILED_CITATION_CONFIDENCE_CAP = 0.3;
```

- [ ] **Step 2: Write the failing tests**

Add to `src/lib/citation.test.ts`:

```ts
import { applyConfidence, verifyAnswer } from "@/lib/citation"; // extend import
import { FAILED_CITATION_CONFIDENCE_CAP, type RawAnswer } from "@/lib/contract";

describe("applyConfidence", () => {
  it("passes confidence through when nothing failed", () => {
    expect(applyConfidence(0.9, false)).toBe(0.9);
  });
  it("caps confidence at the low band when something failed", () => {
    expect(applyConfidence(0.9, true)).toBe(FAILED_CITATION_CONFIDENCE_CAP);
    expect(applyConfidence(0.2, true)).toBe(0.2); // never raises an already-low score
  });
});

describe("verifyAnswer", () => {
  const docText = "-- 1 of 1 --\nLiability shall be uncapped for breach of confidentiality.";
  const docs = new Map<string, string>([["doc_1", docText]]);

  it("marks real citations verified, derives page, and keeps confidence", () => {
    const answer: RawAnswer = {
      value: "Uncapped for confidentiality.",
      citations: [{ docId: "doc_1", quote: "Liability shall be uncapped for breach", section: "§12" }],
      confidence: 0.88,
    };
    const result = verifyAnswer(answer, docs);
    expect(result.citations[0].verified).toBe(true);
    expect(result.citations[0].page).toBe(1);
    expect(result.confidence).toBe(0.88);
  });

  it("flags a fabricated citation and caps the whole answer's confidence", () => {
    const answer: RawAnswer = {
      value: "Capped at fees.",
      citations: [{ docId: "doc_1", quote: "liability is capped at fees paid in the prior 12 months" }],
      confidence: 0.95,
    };
    const result = verifyAnswer(answer, docs);
    expect(result.citations[0].verified).toBe(false);
    expect(result.citations[0].page).toBeUndefined();
    expect(result.confidence).toBe(FAILED_CITATION_CONFIDENCE_CAP);
  });

  it("treats an unknown docId as unverified", () => {
    const answer: RawAnswer = {
      value: "x",
      citations: [{ docId: "missing", quote: "Liability shall be uncapped for breach" }],
      confidence: 0.7,
    };
    const result = verifyAnswer(answer, docs);
    expect(result.citations[0].verified).toBe(false);
    expect(result.confidence).toBe(FAILED_CITATION_CONFIDENCE_CAP);
  });
});
```

- [ ] **Step 3: Run to verify it fails**

Run: `pnpm exec vitest run src/lib/citation.test.ts`
Expected: FAIL — `applyConfidence` / `verifyAnswer` not exported.

- [ ] **Step 4: Implement the downgrade and the orchestrator**

Add to `src/lib/citation.ts` (extend the contract import with `FAILED_CITATION_CONFIDENCE_CAP`):

```ts
/**
 * Apply the confidence downgrade (decisions d4/n5): if any citation failed its
 * quote check, cap the whole answer's confidence at the low band. Never raises
 * an already-lower score.
 */
export function applyConfidence(raw: number, anyUnverified: boolean): number {
  return anyUnverified ? Math.min(raw, FAILED_CITATION_CONFIDENCE_CAP) : raw;
}

/**
 * Verify a raw model answer against the source documents (keyed by id) and
 * return the annotated answer consumers render: each citation flagged
 * verified/unverified (keep-but-flag, decision n3) with a derived page, and the
 * confidence downgraded if anything failed.
 */
export function verifyAnswer(
  answer: RawAnswer,
  docTextById: Map<string, string>,
): VerifiedAnswer {
  const citations: VerifiedCitation[] = answer.citations.map((c) => {
    const docText = docTextById.get(c.docId);
    const verified = docText ? verifyCitation(c.quote, docText) : false;
    const page = verified && docText ? derivePage(docText, c.quote) : undefined;
    return { ...c, verified, page };
  });
  const anyUnverified = citations.some((c) => !c.verified);
  return {
    value: answer.value,
    citations,
    confidence: applyConfidence(answer.confidence, anyUnverified),
  };
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm exec vitest run src/lib/citation.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/contract.ts src/lib/citation.ts src/lib/citation.test.ts
git commit -m "feat: verify answers and auto-downgrade confidence on failed citations"
```

---

### Task 7: Contract — anti-fabrication prompt strategy (acceptance criterion 2)

**Files:**
- Modify: `src/lib/contract.ts`
- Test: `src/lib/contract.test.ts`

The prompt-strategy text is the elicitation half of the guard: instruct the model to quote verbatim, cite only what's in the documents, read (never quote) the `-- N of M --` markers to know the page, and self-rate document-support confidence. One shared core, plus a per-mode tail (d5): Review points at the tool; the Assistant describes the footer. (Wiring this into `composeSystemPrompt` is downstream #9/#11 — this task only defines and tests the text.)

- [ ] **Step 1: Write the failing tests**

Add to `src/lib/contract.test.ts`:

```ts
import { assistantPromptStrategy, reviewPromptStrategy, FOOTER_OPEN, FOOTER_CLOSE, REVIEW_TOOL_NAME } from "@/lib/contract"; // extend import

describe("prompt strategies", () => {
  it("share the anti-fabrication core", () => {
    for (const text of [assistantPromptStrategy(), reviewPromptStrategy()]) {
      expect(text.toLowerCase()).toContain("verbatim");
      expect(text).toMatch(/only|do not invent|never/i);
      expect(text).toContain("-- N of M --"); // explains the page markers
      expect(text.toLowerCase()).toContain("support"); // confidence = document support
    }
  });

  it("the assistant strategy describes the footer delimiters", () => {
    const text = assistantPromptStrategy();
    expect(text).toContain(FOOTER_OPEN);
    expect(text).toContain(FOOTER_CLOSE);
  });

  it("the review strategy points at the tool", () => {
    expect(reviewPromptStrategy()).toContain(REVIEW_TOOL_NAME);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm exec vitest run src/lib/contract.test.ts`
Expected: FAIL — strategy functions / footer constants / `REVIEW_TOOL_NAME` not exported.

- [ ] **Step 3: Add the constants and strategy text**

Add to `src/lib/contract.ts`:

```ts
/** Tool name the Review grid forces the model to call (decision d5). */
export const REVIEW_TOOL_NAME = "submit_answer";

/** Delimiters bracketing the Assistant's machine-readable JSON footer (decision d5). */
export const FOOTER_OPEN = "<<<CITATIONS_JSON>>>";
export const FOOTER_CLOSE = "<<<END_CITATIONS_JSON>>>";

// The shared anti-fabrication instructions both modes prepend. References the
// page markers extract.ts now preserves so the model can cite a real page.
const CITATION_CORE = `# Citations and confidence
- Support factual claims with citations drawn ONLY from the attached documents. If the documents do not address a point, say so — never invent support.
- Every citation must include a SHORT VERBATIM QUOTE copied exactly from the document text (${MIN_QUOTE_LENGTH}-${MAX_QUOTE_LENGTH} characters), not a paraphrase. If you cannot quote it, do not cite it.
- Identify the source document by its id, and include the section label (e.g. "§12.3") when you can.
- The document text contains page-boundary lines of the form "-- N of M --". Never quote these lines, but use them to know which page a passage is on. Do not invent page numbers.
- Provide a confidence value in [0,1] meaning HOW WELL THE ATTACHED DOCUMENTS SUPPORT YOUR ANSWER — not your certainty that the answer is correct. Lower it when the documents are silent or only partially on point.`;

/** Prompt strategy for the Review grid: structured output via forced tool-use. */
export function reviewPromptStrategy(): string {
  return `${CITATION_CORE}
- Return your answer by calling the \`${REVIEW_TOOL_NAME}\` tool: put the answer in \`value\`, the supporting verbatim quotes in \`citations\`, and your document-support score in \`confidence\`.`;
}

/** Prompt strategy for the Assistant: stream prose, then a delimited JSON footer. */
export function assistantPromptStrategy(): string {
  return `${CITATION_CORE}

# Output format
- Write your answer as ordinary prose for the user to read.
- AFTER the prose, append a machine-readable footer on its own lines: the marker ${FOOTER_OPEN}, then a single JSON object {"citations": [ {"docId": "...", "quote": "...", "section": "..."} ], "confidence": 0.0}, then the marker ${FOOTER_CLOSE}. Put nothing after the closing marker.`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run src/lib/contract.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/contract.ts src/lib/contract.test.ts
git commit -m "feat: add anti-fabrication prompt strategy for both tabs"
```

---

### Task 8: Contract — emission helpers (decision d5)

**Files:**
- Modify: `src/lib/contract.ts`
- Test: `src/lib/contract.test.ts`

Two helpers. `buildReviewTool()` returns the Anthropic tool definition whose `input_schema` is generated from `RawAnswerSchema` via `z.toJSONSchema` (verified v4 API) — #11 will pass it with `tool_choice: { type: "tool", name: REVIEW_TOOL_NAME }`. `parseAssistantFooter()` splits streamed text into prose `value` + parsed footer, tolerating the streaming/partial and malformed cases (risk n8): no footer, footer not yet closed, or invalid JSON all yield `footer: null` without throwing.

- [ ] **Step 1: Write the failing tests**

Add to `src/lib/contract.test.ts`:

```ts
import { buildReviewTool, parseAssistantFooter } from "@/lib/contract"; // extend import

describe("buildReviewTool", () => {
  it("produces an Anthropic tool with a JSON-Schema input", () => {
    const tool = buildReviewTool();
    expect(tool.name).toBe(REVIEW_TOOL_NAME);
    expect(typeof tool.description).toBe("string");
    const schema = tool.input_schema as { type: string; properties: Record<string, unknown>; required?: string[] };
    expect(schema.type).toBe("object");
    expect(Object.keys(schema.properties)).toEqual(expect.arrayContaining(["value", "citations", "confidence"]));
    expect(schema.required).toEqual(expect.arrayContaining(["value", "citations", "confidence"]));
  });
});

describe("parseAssistantFooter", () => {
  const footer = `${FOOTER_OPEN}\n{"citations":[{"docId":"doc_1","quote":"liability shall be uncapped"}],"confidence":0.8}\n${FOOTER_CLOSE}`;

  it("splits prose from a complete footer", () => {
    const result = parseAssistantFooter(`Here is the answer.\n\n${footer}`);
    expect(result.value).toBe("Here is the answer.");
    expect(result.footer?.confidence).toBe(0.8);
    expect(result.footer?.citations[0].docId).toBe("doc_1");
  });

  it("returns null footer and full text when no footer present", () => {
    const result = parseAssistantFooter("Just prose, still streaming");
    expect(result.value).toBe("Just prose, still streaming");
    expect(result.footer).toBeNull();
  });

  it("returns null footer when the footer is not yet closed (mid-stream)", () => {
    const result = parseAssistantFooter(`Answer.\n${FOOTER_OPEN}\n{"citations":[`);
    expect(result.value).toBe("Answer.");
    expect(result.footer).toBeNull();
  });

  it("returns null footer (not a throw) on malformed JSON", () => {
    const result = parseAssistantFooter(`Answer.\n${FOOTER_OPEN}\nnot json at all\n${FOOTER_CLOSE}`);
    expect(result.value).toBe("Answer.");
    expect(result.footer).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm exec vitest run src/lib/contract.test.ts`
Expected: FAIL — `buildReviewTool` / `parseAssistantFooter` not exported.

- [ ] **Step 3: Implement the emission helpers**

Add to `src/lib/contract.ts`:

```ts
/** Result of splitting a (possibly streaming) Assistant message into prose + footer. */
export interface ParsedAssistant {
  /** The prose answer with the footer removed. */
  value: string;
  /** The parsed footer, or null if absent, not yet closed, or malformed. */
  footer: RawFooter | null;
}

/**
 * Build the Anthropic tool definition the Review grid forces (decision d5). The
 * input schema is generated from RawAnswerSchema so the shape has ONE source of
 * truth. #11 passes this with tool_choice { type: "tool", name: REVIEW_TOOL_NAME }.
 */
export function buildReviewTool() {
  return {
    name: REVIEW_TOOL_NAME,
    description:
      "Submit the grounded answer with supporting verbatim citations and a document-support confidence score.",
    input_schema: z.toJSONSchema(RawAnswerSchema) as Record<string, unknown>,
  };
}

/**
 * Split a (possibly mid-stream) Assistant message into prose `value` and the
 * parsed footer. Tolerant by design (risk n8): no footer, an unclosed footer
 * still streaming, or malformed JSON all return `footer: null` without throwing
 * — only a complete, well-formed, schema-valid footer parses.
 */
export function parseAssistantFooter(text: string): ParsedAssistant {
  const openIdx = text.indexOf(FOOTER_OPEN);
  if (openIdx === -1) return { value: text.trim(), footer: null };

  const value = text.slice(0, openIdx).trim();
  const closeIdx = text.indexOf(FOOTER_CLOSE, openIdx + FOOTER_OPEN.length);
  if (closeIdx === -1) return { value, footer: null }; // not closed yet (streaming)

  const json = text.slice(openIdx + FOOTER_OPEN.length, closeIdx).trim();
  try {
    const parsed = RawFooterSchema.safeParse(JSON.parse(json));
    return { value, footer: parsed.success ? parsed.data : null };
  } catch {
    return { value, footer: null }; // malformed JSON — degrade, don't throw
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run src/lib/contract.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/contract.ts src/lib/contract.test.ts
git commit -m "feat: add review tool-use and assistant footer-parse emission helpers"
```

---

### Task 9: End-to-end verification against a real sample doc (acceptance criterion 4)

**Files:**
- Test: `src/lib/citation.test.ts` (add an integration block)

Prove the pieces compose on *real* extracted bytes, not hand-built strings: build a multi-page PDF, run it through the real `extractText` (with preserved markers), then verify a real quote (verified + correct page) and a fabricated quote (flagged + confidence capped). This is the "citations point at real passages" criterion.

- [ ] **Step 1: Write the integration test**

Add to `src/lib/citation.test.ts`:

```ts
import { extractText, PDF_MIME } from "@/lib/extract"; // extend import
import { makeMultiPagePdf } from "@/test/fixtures";

describe("verifyAnswer — integration against real extracted text", () => {
  it("verifies a real quote with its page and flags a fabricated one", async () => {
    const buffer = await makeMultiPagePdf([
      "Recitals and background of the Agreement",
      "Liability shall be uncapped for breach of confidentiality",
    ]);
    const { text } = await extractText(buffer, PDF_MIME);
    const docs = new Map<string, string>([["doc_1", text]]);

    const good = verifyAnswer(
      {
        value: "Confidentiality breach is uncapped.",
        citations: [{ docId: "doc_1", quote: "Liability shall be uncapped for breach of confidentiality" }],
        confidence: 0.9,
      },
      docs,
    );
    expect(good.citations[0].verified).toBe(true);
    expect(good.citations[0].page).toBe(2);
    expect(good.confidence).toBe(0.9);

    const bad = verifyAnswer(
      {
        value: "It is capped.",
        citations: [{ docId: "doc_1", quote: "Liability is capped at the fees paid in the last twelve months" }],
        confidence: 0.9,
      },
      docs,
    );
    expect(bad.citations[0].verified).toBe(false);
    expect(bad.confidence).toBe(FAILED_CITATION_CONFIDENCE_CAP);
  });
});
```

- [ ] **Step 2: Run the integration test**

Run: `pnpm exec vitest run src/lib/citation.test.ts`
Expected: PASS. (If pdf-parse's marker format differs from the assumed `-- N of M --`, the page assertion fails here — adjust the marker regex in `citation.ts`/`extract.ts` to match observed output. This test is the empirical check on that assumption.)

- [ ] **Step 3: Commit**

```bash
git add src/lib/citation.test.ts
git commit -m "test: verify the contract end-to-end on real extracted PDF text"
```

---

### Task 10: Full suite + typecheck

**Files:** none (verification only)

- [ ] **Step 1: Run the whole test suite**

Run: `pnpm exec vitest run`
Expected: PASS — all new tests plus the pre-existing suite (no regressions in `extract.test.ts` or elsewhere).

- [ ] **Step 2: Typecheck**

Run: `pnpm exec tsc --noEmit`
Expected: clean (no type errors). Confirms the `z.toJSONSchema` cast and the contract/citation types line up.

- [ ] **Step 3: Lint (if configured)**

Run: `pnpm lint` (skip if no lint script exists)
Expected: clean.
