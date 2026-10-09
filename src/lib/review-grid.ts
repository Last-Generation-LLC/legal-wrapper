// The Review grid's client-side core: the column model (localStorage-persisted
// per the #13 decision — "local for now, SQLite later"), per-cell run state,
// the needs-run semantics, and the cache-aware runner.
//
// The runner encodes the #12 cache note, which is the grid's cost lever: an
// Anthropic cache entry is only readable after the first response against that
// prefix begins, so concurrent identical-prefix calls ALL miss. Per document we
// therefore run ONE warming cell to completion before fanning out the rest,
// with a global in-flight cap across documents.

import * as z from "zod";
import type { VerifiedAnswer } from "@/lib/contract";
import type { TokenUsage } from "@/lib/pricing";

/** Global in-flight request cap — protects rate limits, keeps caching effective. */
export const RUN_CONCURRENCY = 5;

export const ReviewColumnSchema = z.object({
  id: z.string().min(1),
  title: z.string(),
  prompt: z.string(),
  /** Column width in px (handoff sizes the starters individually). */
  width: z.number().int().positive(),
  /** Numeric answers render in mono (handoff "Term (years)" column). */
  numeric: z.boolean().optional(),
});
export type ReviewColumn = z.infer<typeof ReviewColumnSchema>;

/** The handoff's six NDA starter columns — seeded on first visit (locked decision). */
export const STARTER_COLUMNS: ReviewColumn[] = [
  {
    id: "governing-law",
    title: "Governing law",
    prompt:
      'What is the governing law clause? Return state/country only, or "Not specified."',
    width: 160,
  },
  {
    id: "term-years",
    title: "Term (years)",
    prompt:
      'What is the term of the confidentiality obligation, in years? Return a number or range, or "Perpetual."',
    width: 130,
    numeric: true,
  },
  {
    id: "mutual",
    title: "Mutual?",
    prompt:
      'Is the NDA mutual or one-way? Return "Mutual" or "One-way (disclosing: X)".',
    width: 150,
  },
  {
    id: "residual-clause",
    title: "Residual clause",
    prompt:
      'Is there a residual knowledge clause? Return "Yes" + one-sentence summary, or "No."',
    width: 260,
  },
  {
    id: "non-solicit",
    title: "Non-solicit",
    prompt: "Does the NDA contain a non-solicit of employees? If yes, for how long?",
    width: 200,
  },
  {
    id: "injunctive-relief",
    title: "Injunctive relief",
    prompt: "Does the NDA explicitly provide for injunctive relief without bond?",
    width: 200,
  },
];

export const COLUMNS_STORAGE_KEY = "ll.review.columns.v1";

const StoredColumnsSchema = z.array(ReviewColumnSchema).min(1);

/**
 * Read the user's columns from localStorage; seed the starters when there is
 * nothing there (first visit) or the stored value no longer parses (schema
 * drift degrades to a re-seed, never a crash).
 */
export function loadColumns(storage: Pick<Storage, "getItem">): ReviewColumn[] {
  const raw = storage.getItem(COLUMNS_STORAGE_KEY);
  if (raw == null) return STARTER_COLUMNS;
  try {
    const parsed = StoredColumnsSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : STARTER_COLUMNS;
  } catch {
    return STARTER_COLUMNS;
  }
}

export const MODEL_STORAGE_KEY = "ll.review.model.v1";

/** The stored Review model pick, if it is still on the allowlist; else the fallback. */
export function loadModel(
  storage: Pick<Storage, "getItem">,
  allowed: readonly string[],
  fallback: string,
): string {
  const raw = storage.getItem(MODEL_STORAGE_KEY);
  return raw !== null && allowed.includes(raw) ? raw : fallback;
}

export function saveModel(storage: Pick<Storage, "setItem">, model: string): void {
  storage.setItem(MODEL_STORAGE_KEY, model);
}

export function saveColumns(
  storage: Pick<Storage, "setItem">,
  columns: ReviewColumn[],
): void {
  storage.setItem(COLUMNS_STORAGE_KEY, JSON.stringify(columns));
}

export function newColumn(): ReviewColumn {
  return { id: crypto.randomUUID(), title: "New column", prompt: "", width: 200 };
}

/** Usage fields the cell route returns — carried on done cells for #17.
 *  Canonical shape lives in pricing.ts; re-exported here as the grid's
 *  historical name so existing `import { CellUsage } from "@/lib/review-grid"`
 *  callers keep working. */
export type CellUsage = TokenUsage;

/**
 * One cell's state. "Idle" is the absence of an entry in the map. A done cell
 * remembers the prompt it ran with so editing a column's prompt makes its
 * cells run-eligible again (locked decision) — and the model that answered,
 * so switching models does the same and cost is priced per cell.
 */
export type CellResult =
  | { status: "running" }
  | {
      status: "done";
      answer: VerifiedAnswer;
      usage: CellUsage;
      promptUsed: string;
      /** Model id that produced the answer (absent only in legacy test fixtures). */
      modelUsed?: string;
    }
  | { status: "error"; message: string };

export type CellMap = Record<string, CellResult>;

export function cellKey(docId: string, colId: string): string {
  return `${docId}::${colId}`;
}

/**
 * Whether "Run all" should (re-)run this cell: idle and error cells always,
 * done cells only when the column prompt — or, when given, the selected model —
 * changed since they ran. Done cells with an unchanged prompt and model are
 * never re-billed; in-flight cells are left alone.
 */
export function needsRun(
  cell: CellResult | undefined,
  currentPrompt: string,
  currentModel?: string,
): boolean {
  if (!cell) return true;
  if (cell.status === "running") return false;
  if (cell.status === "error") return true;
  if (currentModel !== undefined && cell.modelUsed !== undefined && cell.modelUsed !== currentModel) {
    return true;
  }
  return cell.promptUsed !== currentPrompt;
}

/** Status-bar tallies. Total counts every doc × column pair; idle = the remainder. */
export function gridCounts(
  docIds: string[],
  columns: ReviewColumn[],
  cells: CellMap,
): { total: number; done: number; running: number; error: number } {
  let done = 0;
  let running = 0;
  let error = 0;
  for (const docId of docIds) {
    for (const col of columns) {
      const cell = cells[cellKey(docId, col.id)];
      if (!cell) continue;
      if (cell.status === "done") done++;
      else if (cell.status === "running") running++;
      else error++;
    }
  }
  return { total: docIds.length * columns.length, done, running, error };
}

/** Compact citation tag for a done cell ("p.6 · §14.1"); null when uncited. */
export function cellCitationLabel(answer: VerifiedAnswer): string | null {
  const citation = answer.citations[0];
  if (!citation) return null;
  const parts: string[] = [];
  if (citation.page != null) parts.push(`p.${citation.page}`);
  if (citation.section) parts.push(citation.section);
  let label = parts.join(" · ") || "cited";
  if (!citation.verified) label += " · unverified";
  return label;
}

/** What a single cell call resolves to — the cell route's success body. */
export type CellResponse = { answer: VerifiedAnswer; usage: CellUsage; model?: string };

export type RunCellFn = (docId: string, prompt: string) => Promise<CellResponse>;

/** POST one cell to the API; non-OK responses throw with the route's message. */
export async function fetchCell(
  docId: string,
  prompt: string,
  model?: string,
): Promise<CellResponse> {
  const res = await fetch("/api/review/cell", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(model ? { docId, prompt, model } : { docId, prompt }),
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(
      (body as { error?: string } | null)?.error ?? `Request failed (${res.status})`,
    );
  }
  return body as CellResponse;
}

/** Minimal counting semaphore — caps concurrently running tasks at `limit`. */
export class Semaphore {
  private active = 0;
  private waiters: Array<() => void> = [];

  constructor(private readonly limit: number) {}

  async run<T>(task: () => Promise<T>): Promise<T> {
    if (this.active >= this.limit) {
      await new Promise<void>((resolve) => this.waiters.push(resolve));
    }
    this.active++;
    try {
      return await task();
    } finally {
      this.active--;
      this.waiters.shift()?.();
    }
  }
}

/**
 * Run every run-eligible cell. Documents proceed in parallel under one global
 * concurrency cap, but within a document the first cell runs ALONE and must
 * finish (writing the doc's cache entry) before the rest fan out — see the
 * module comment. If the warming cell fails, the document's remaining cells
 * are NOT attempted: without a cache entry each would pay full input price,
 * and whatever killed the first call (413 too long, 429) would likely kill
 * them too. They're marked as errors so the next "Run all" retries them.
 *
 * State flows out through `onUpdate` (the component owns the React state);
 * `runCell` is injected so tests never touch the network.
 */
export async function runGrid(options: {
  docIds: string[];
  columns: ReviewColumn[];
  cells: CellMap;
  runCell: RunCellFn;
  onUpdate: (docId: string, colId: string, result: CellResult) => void;
  concurrency?: number;
  /** The selected model: done cells answered by a different model re-run. */
  model?: string;
}): Promise<void> {
  const { docIds, columns, cells, runCell, onUpdate, model } = options;
  const semaphore = new Semaphore(options.concurrency ?? RUN_CONCURRENCY);

  // Resolves to null on success, or the error message on failure (the warm
  // cell's message is threaded into its doc's skipped cells so every affected
  // cell says WHY it wasn't run — e.g. the #16 over-ceiling 413).
  const runOne = (docId: string, col: ReviewColumn): Promise<string | null> =>
    semaphore.run(async () => {
      onUpdate(docId, col.id, { status: "running" });
      try {
        const { answer, usage, model } = await runCell(docId, col.prompt);
        onUpdate(docId, col.id, { status: "done", answer, usage, promptUsed: col.prompt, modelUsed: model });
        return null;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        onUpdate(docId, col.id, { status: "error", message });
        return message;
      }
    });

  await Promise.all(
    docIds.map(async (docId) => {
      const queue = columns.filter((col) => needsRun(cells[cellKey(docId, col.id)], col.prompt, model));
      if (queue.length === 0) return;

      const [warm, ...rest] = queue;
      const warmError = await runOne(docId, warm);
      if (warmError !== null) {
        for (const col of rest) {
          onUpdate(docId, col.id, {
            status: "error",
            message: `Not run — the document's first cell failed (cache warm-up): ${warmError}`,
          });
        }
        return;
      }
      await Promise.all(rest.map((col) => runOne(docId, col)));
    }),
  );
}

/**
 * Re-run a SINGLE cell (the inspector's Regenerate). Unlike runGrid this does
 * no cache-warming and uses no semaphore — there is no fan-out to protect, just
 * one call. If the document's 5-minute cache entry from an earlier run is still
 * warm, this is a cheap cache read; otherwise it pays full input price. State
 * flows out through the same `onUpdate` the grid uses, so the cell updates in
 * place. `runCell` is injected so tests never touch the network.
 */
export async function regenerateCell(options: {
  docId: string;
  col: ReviewColumn;
  runCell: RunCellFn;
  onUpdate: (docId: string, colId: string, result: CellResult) => void;
}): Promise<void> {
  const { docId, col, runCell, onUpdate } = options;
  onUpdate(docId, col.id, { status: "running" });
  try {
    const { answer, usage, model } = await runCell(docId, col.prompt);
    onUpdate(docId, col.id, { status: "done", answer, usage, promptUsed: col.prompt, modelUsed: model });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    onUpdate(docId, col.id, { status: "error", message });
  }
}
