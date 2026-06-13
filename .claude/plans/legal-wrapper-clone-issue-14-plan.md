# Cell inspector + regenerate — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a bottom inspector drawer to the Review grid that opens when a `done` cell is selected — showing the full answer, confidence, citations, and the column's full prompt — with a Regenerate action that re-runs that single cell in place.

**Architecture:** Selection (`{ docId, colId } | null`) becomes a third piece of state in `ReviewScreen`, alongside the existing `columns` and `cells`. `GridCell` gains optional `selected`/`onSelect` props: a `done` cell renders as a clickable button that carries the amber selection outline. A new presentational `CellInspector` reads the *live* cell out of the `cells` map each render, so a Regenerate (running → done) updates the open drawer automatically. Regenerate reuses the existing `/api/review/cell` route via a small `regenerateCell` runner that mirrors the grid's per-cell logic without the cache-warming semaphore (single cell, no fan-out).

**Tech Stack:** Next.js 16 App Router (client components), React `useState`/`useEffect`, TypeScript, Tailwind v4, vitest + jsdom + @testing-library/react. No new dependencies. Reuses `fetchCell`, `Pill`, `Btn`, `Icon`, `ConfidenceDot`, and `docLabel`.

---

## File structure

| File | Responsibility | Action |
|------|----------------|--------|
| `src/lib/doc-display.ts` | Add shared `citationLabel`/`citationDocName` (extracted from chat-message) so the Assistant and the inspector format citation pills identically. | Modify |
| `src/lib/doc-display.test.ts` | Cover the new citation-label helpers. | Modify (or create if absent) |
| `src/components/assistant/chat-message.tsx` | Drop its local citation-label copies; import the shared ones (pure refactor, Assistant tests guard it). | Modify |
| `src/lib/review-grid.ts` | Add `regenerateCell` — a single-cell runner (running → done/error) injecting `runCell` for tests. | Modify |
| `src/lib/review-grid.test.ts` | Cover `regenerateCell` success + failure. | Modify |
| `src/components/review/grid-cell.tsx` | `done` cell becomes a clickable button; add `selected` outline + `onSelect`. Other states unchanged. | Modify |
| `src/components/review/grid-cell.test.tsx` | Cover click → onSelect, selected outline, non-done cells inert. | Modify |
| `src/components/review/cell-inspector.tsx` | The drawer: live cell value/confidence/citations on the left, full prompt + actions on the right. | Create |
| `src/components/review/cell-inspector.test.tsx` | Cover done/running/error rendering + action callbacks + disabled states. | Create |
| `src/components/review/review-screen.tsx` | Selection state, regenerate handler, selection invalidation, render `<CellInspector>`, wire `selected`/`onSelect` into `GridCell`. | Modify |
| `src/components/review/review-screen.test.tsx` | Integration: click done cell → inspector; selection follows; Regenerate updates in place; delete-selected-column closes; Edit prompt opens editor. | Modify |

---

## Task 1: Shared citation-label helper

The Assistant already formats a citation pill label (`citationLabel`/`citationDocName` local to `chat-message.tsx`). The inspector needs the same format. Extract them to `doc-display.ts` so there is one definition, then point the Assistant at it.

**Files:**
- Modify: `src/lib/doc-display.ts`
- Test: `src/lib/doc-display.test.ts`
- Modify: `src/components/assistant/chat-message.tsx:17-30` (remove local copies, import shared)

- [ ] **Step 1: Write the failing test**

Add to `src/lib/doc-display.test.ts` (create the file with this content if it does not exist; if it exists, append the `describe` block and add the import):

```ts
import { describe, expect, it } from "vitest";
import { citationLabel } from "@/lib/doc-display";
import type { DocumentMeta } from "@/lib/documents";

const docs: DocumentMeta[] = [
  {
    id: "d1",
    filename: "acme-nda.pdf",
    title: null,
    mimeType: "application/pdf",
    tokenCount: 5000,
    tokenCountEstimated: false,
    createdAt: new Date(),
  },
];

describe("citationLabel", () => {
  it("strips the extension and appends section + page", () => {
    expect(
      citationLabel({ docId: "d1", quote: "q", section: "§14.1", page: 6, verified: true }, docs),
    ).toBe("acme-nda §14.1 · p.6");
  });

  it("marks unverified citations", () => {
    expect(
      citationLabel({ docId: "d1", quote: "q", section: "§3", verified: false }, docs),
    ).toBe("acme-nda §3 · unverified");
  });

  it("falls back to the docId when the document is unknown", () => {
    expect(
      citationLabel({ docId: "ghost", quote: "q", verified: true }, docs),
    ).toBe("ghost");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/lib/doc-display.test.ts`
Expected: FAIL — `citationLabel` is not exported from `@/lib/doc-display`.

- [ ] **Step 3: Add the helpers to `doc-display.ts`**

Append to `src/lib/doc-display.ts` (and add the type import at the top):

```ts
import type { VerifiedCitation } from "@/lib/contract";

// Handoff: citation pills carry the doc name without its file extension.
export function citationDocName(
  citation: Pick<VerifiedCitation, "docId">,
  documents: Array<{ id: string; title: string | null; filename: string }>,
): string {
  const doc = documents.find((d) => d.id === citation.docId);
  if (!doc) return citation.docId;
  return docLabel(doc).replace(/\.(pdf|docx)$/i, "");
}

// "acme-nda §14.1 · p.6", with a "· unverified" suffix when the quote failed
// the verbatim check. One definition, used by the Assistant message and the
// Review cell inspector.
export function citationLabel(
  citation: Pick<VerifiedCitation, "docId" | "section" | "page" | "verified">,
  documents: Array<{ id: string; title: string | null; filename: string }>,
): string {
  let label = citationDocName(citation, documents);
  if (citation.section) label += ` ${citation.section}`;
  if (citation.page != null) label += ` · p.${citation.page}`;
  if (!citation.verified) label += " · unverified";
  return label;
}
```

- [ ] **Step 4: Point `chat-message.tsx` at the shared helper**

In `src/components/assistant/chat-message.tsx`: delete the local `citationDocName` and `citationLabel` functions (lines ~17-30), and add `citationLabel` to the existing `doc-display` import:

```tsx
import { citationLabel, docLabel } from "@/lib/doc-display";
```

(`docLabel` may have become unused after removing `citationDocName` — if tsc reports it unused, drop it from the import. `DocumentMeta`/`VerifiedCitation` type imports that only the removed functions used can also go if tsc flags them.)

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm vitest run src/lib/doc-display.test.ts src/components/assistant/chat-message.test.tsx`
Expected: PASS (the Assistant message test still renders the same pill labels).

Also run `pnpm tsc --noEmit` to catch any now-unused imports.

- [ ] **Step 6: Commit**

```bash
git add src/lib/doc-display.ts src/lib/doc-display.test.ts src/components/assistant/chat-message.tsx
git commit -m "refactor: extract shared citationLabel into doc-display"
```

---

## Task 2: `regenerateCell` single-cell runner

Regenerate re-runs one cell. It must not re-warm the document or use the concurrency semaphore (those exist for *fan-out*; a single cell just needs a `running → done/error` transition). Add a small standalone runner so the network logic stays out of the component and is unit-testable.

**Files:**
- Modify: `src/lib/review-grid.ts` (add `regenerateCell` near `runGrid`)
- Test: `src/lib/review-grid.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `src/lib/review-grid.test.ts`:

```ts
import { regenerateCell } from "@/lib/review-grid";

describe("regenerateCell", () => {
  const col = { id: "c1", title: "Governing law", prompt: "What law?", width: 160 };
  const answer = { value: "Delaware", citations: [], confidence: 0.9 };
  const usage = {
    inputTokens: 100,
    outputTokens: 10,
    cacheReadInputTokens: 0,
    cacheCreationInputTokens: 0,
  };

  it("transitions running → done on success, stamping promptUsed", async () => {
    const updates: Array<[string, string, unknown]> = [];
    await regenerateCell({
      docId: "d1",
      col,
      runCell: async () => ({ answer, usage }),
      onUpdate: (docId, colId, result) => updates.push([docId, colId, result]),
    });
    expect(updates[0]).toEqual(["d1", "c1", { status: "running" }]);
    expect(updates[1]).toEqual([
      "d1",
      "c1",
      { status: "done", answer, usage, promptUsed: "What law?" },
    ]);
  });

  it("transitions running → error when the call throws", async () => {
    const updates: Array<[string, string, unknown]> = [];
    await regenerateCell({
      docId: "d1",
      col,
      runCell: async () => {
        throw new Error("Rate limited by the model API — retry shortly.");
      },
      onUpdate: (docId, colId, result) => updates.push([docId, colId, result]),
    });
    expect(updates[0]).toEqual(["d1", "c1", { status: "running" }]);
    expect(updates[1]).toEqual([
      "d1",
      "c1",
      { status: "error", message: "Rate limited by the model API — retry shortly." },
    ]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/lib/review-grid.test.ts`
Expected: FAIL — `regenerateCell` is not exported.

- [ ] **Step 3: Implement `regenerateCell`**

Add to `src/lib/review-grid.ts` (after `runGrid`):

```ts
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
    const { answer, usage } = await runCell(docId, col.prompt);
    onUpdate(docId, col.id, { status: "done", answer, usage, promptUsed: col.prompt });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    onUpdate(docId, col.id, { status: "error", message });
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vitest run src/lib/review-grid.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/review-grid.ts src/lib/review-grid.test.ts
git commit -m "feat: add regenerateCell single-cell runner"
```

---

## Task 3: GridCell selection (click + amber outline)

A `done` cell becomes selectable: it renders as a button that fires `onSelect` and shows the amber outline when `selected`. Other states (idle/running/error) stay inert. Both new props are optional so existing call sites and tests keep compiling.

**Files:**
- Modify: `src/components/review/grid-cell.tsx`
- Test: `src/components/review/grid-cell.test.tsx`

- [ ] **Step 1: Write the failing test**

Append to `src/components/review/grid-cell.test.tsx` (add `fireEvent`, `vi` to imports):

```tsx
// add to the existing import: import { render, screen, fireEvent } from "@testing-library/react";
// add to the existing import: import { describe, expect, it, vi } from "vitest";

it("fires onSelect when a done cell is clicked", () => {
  const onSelect = vi.fn();
  render(<GridCell cell={done({})} col={col} onSelect={onSelect} />);
  fireEvent.click(screen.getByRole("button"));
  expect(onSelect).toHaveBeenCalledTimes(1);
});

it("carries the selection outline when selected", () => {
  render(<GridCell cell={done({})} col={col} selected onSelect={() => {}} />);
  expect(screen.getByRole("button").className).toContain("outline-amber");
});

it("does not render a button for non-done cells", () => {
  render(<GridCell cell={{ status: "running" }} col={col} onSelect={() => {}} />);
  expect(screen.queryByRole("button")).not.toBeInTheDocument();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/components/review/grid-cell.test.tsx`
Expected: FAIL — `onSelect`/`selected` are not props; no button is rendered for done cells.

- [ ] **Step 3: Implement the clickable done cell**

Replace `src/components/review/grid-cell.tsx` with:

```tsx
import { cn } from "@/lib/utils";
import { ConfidenceDot } from "@/components/ui/confidence-dot";
import { cellCitationLabel, type CellResult, type ReviewColumn } from "@/lib/review-grid";

// One grid cell, four states per the handoff: idle (—), running (pulse dot +
// shimmer bar), error (red dot + message), done (clamped value + confidence
// dot + citation tag). Purely presentational — state lives in ReviewScreen.
// A done cell is clickable: it opens the inspector and carries the amber
// selection outline. Other states are inert.
export function GridCell({
  cell,
  col,
  selected = false,
  onSelect,
}: {
  cell: CellResult | undefined;
  col: ReviewColumn;
  selected?: boolean;
  onSelect?: () => void;
}) {
  if (cell?.status === "done") {
    return (
      <button
        type="button"
        onClick={onSelect}
        aria-pressed={selected}
        style={{ width: col.width }}
        className={cn(
          "block shrink-0 cursor-pointer border-r border-border-soft px-3 py-3 text-left",
          "outline-offset-[-2px] hover:bg-panel/40",
          selected && "outline outline-2 outline-amber",
        )}
      >
        <div
          className={cn(
            "line-clamp-3 text-[12.5px] leading-[1.45] text-foreground",
            col.numeric && "font-mono",
          )}
        >
          {cell.answer.value}
        </div>
        <div className="mt-1.5 flex items-center gap-1.5">
          <ConfidenceDot confidence={cell.answer.confidence} className="size-[5px]" />
          {cellCitationLabel(cell.answer) && (
            <span className="font-mono text-[9.5px] tracking-[0.02em] text-dim">
              {cellCitationLabel(cell.answer)}
            </span>
          )}
        </div>
      </button>
    );
  }

  return (
    <div
      style={{ width: col.width }}
      className="shrink-0 border-r border-border-soft px-3 py-3"
    >
      {!cell && <div className="font-mono text-[10.5px] text-dim">—</div>}

      {cell?.status === "running" && (
        <>
          <div className="flex items-center gap-2">
            <span className="inline-block size-[7px] animate-pulse rounded-full bg-amber" />
            <span className="font-mono text-[11px] text-amber">running</span>
          </div>
          <div className="mt-1.5 h-0.5 overflow-hidden rounded-[1px] bg-border-soft">
            <div className="h-full w-2/5 animate-[ll-shimmer_1.6s_ease-in-out_infinite] bg-amber" />
          </div>
        </>
      )}

      {cell?.status === "error" && (
        <>
          <div className="flex items-center gap-1.5">
            <span className="inline-block size-[7px] rounded-full bg-red" />
            <span className="font-mono text-[10.5px] text-red">error</span>
          </div>
          <div className="mt-1 text-[11.5px] leading-[1.4] text-muted-foreground">
            {cell.message}
          </div>
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vitest run src/components/review/grid-cell.test.tsx`
Expected: PASS (existing done-cell tests now find their text inside the button; new selection tests pass).

- [ ] **Step 5: Commit**

```bash
git add src/components/review/grid-cell.tsx src/components/review/grid-cell.test.tsx
git commit -m "feat: make done grid cells selectable with amber outline"
```

---

## Task 4: CellInspector drawer component

A presentational bottom drawer. It receives the *live* cell (so Regenerate's running→done shows through), the column, the document list (for citation labels), a `busy` flag, and three callbacks. Layout: header (doc · column · confidence · close) → body split into the answer (left) and the full prompt + actions (right).

**Files:**
- Create: `src/components/review/cell-inspector.tsx`
- Test: `src/components/review/cell-inspector.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `src/components/review/cell-inspector.test.tsx`:

```tsx
// @vitest-environment jsdom
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { DocumentMeta } from "@/lib/documents";
import type { CellResult, CellUsage, ReviewColumn } from "@/lib/review-grid";
import type { VerifiedAnswer } from "@/lib/contract";
import { CellInspector } from "./cell-inspector";

const doc: DocumentMeta = {
  id: "d1",
  filename: "acme-nda.pdf",
  title: null,
  mimeType: "application/pdf",
  tokenCount: 5000,
  tokenCountEstimated: false,
  createdAt: new Date(),
};

const col: ReviewColumn = {
  id: "c1",
  title: "Governing law",
  prompt: "What is the governing law clause?",
  width: 160,
};

const usage: CellUsage = {
  inputTokens: 100,
  outputTokens: 20,
  cacheReadInputTokens: 0,
  cacheCreationInputTokens: 0,
};

const answer: VerifiedAnswer = {
  value: "Delaware",
  confidence: 0.97,
  citations: [{ docId: "d1", quote: "governed by the laws of Delaware", section: "§14.1", page: 6, verified: true }],
};

const doneCell: CellResult = { status: "done", answer, usage, promptUsed: col.prompt };

function renderInspector(cell: CellResult, overrides: Partial<Parameters<typeof CellInspector>[0]> = {}) {
  return render(
    <CellInspector
      doc={doc}
      col={col}
      cell={cell}
      documents={[doc]}
      busy={false}
      onRegenerate={vi.fn()}
      onEditPrompt={vi.fn()}
      onClose={vi.fn()}
      {...overrides}
    />,
  );
}

describe("CellInspector", () => {
  it("shows the full value, confidence, citation, and the column prompt", () => {
    renderInspector(doneCell);
    expect(screen.getByText("Delaware")).toBeInTheDocument();
    expect(screen.getByText("0.97")).toBeInTheDocument();
    expect(screen.getByText(/acme-nda §14.1 · p.6/)).toBeInTheDocument();
    expect(screen.getByText("governed by the laws of Delaware")).toBeInTheDocument();
    expect(screen.getByText("What is the governing law clause?")).toBeInTheDocument();
  });

  it("fires the action callbacks", () => {
    const onRegenerate = vi.fn();
    const onEditPrompt = vi.fn();
    const onClose = vi.fn();
    renderInspector(doneCell, { onRegenerate, onEditPrompt, onClose });
    fireEvent.click(screen.getByRole("button", { name: /Regenerate/ }));
    fireEvent.click(screen.getByRole("button", { name: /Edit prompt/ }));
    fireEvent.click(screen.getByRole("button", { name: /Close/ }));
    expect(onRegenerate).toHaveBeenCalledTimes(1);
    expect(onEditPrompt).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("disables Regenerate while busy and renders the running state", () => {
    renderInspector({ status: "running" }, { busy: true });
    expect(screen.getByRole("button", { name: /Regenerate/ })).toBeDisabled();
    expect(screen.getByText(/Regenerating/)).toBeInTheDocument();
  });

  it("renders the error message and keeps Regenerate enabled", () => {
    renderInspector({ status: "error", message: "Rate limited by the model API — retry shortly." });
    expect(screen.getByText(/Rate limited/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Regenerate/ })).toBeEnabled();
  });

  it("renders View source as a disabled stub", () => {
    renderInspector(doneCell);
    expect(screen.getByRole("button", { name: /View source/ })).toBeDisabled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/components/review/cell-inspector.test.tsx`
Expected: FAIL — `./cell-inspector` does not exist.

- [ ] **Step 3: Implement `CellInspector`**

Create `src/components/review/cell-inspector.tsx`:

```tsx
import { Btn } from "@/components/ui/btn";
import { Icon } from "@/components/ui/icon";
import { Pill } from "@/components/ui/pill";
import { ConfidenceDot } from "@/components/ui/confidence-dot";
import { citationLabel, docLabel } from "@/lib/doc-display";
import type { DocumentMeta } from "@/lib/documents";
import type { CellResult, ReviewColumn } from "@/lib/review-grid";

// The Review inspector drawer: opens when a done cell is selected. Reads the
// LIVE cell out of ReviewScreen's state, so a Regenerate (running → done)
// updates this panel in place. Presentational — selection + regenerate live in
// ReviewScreen. "View source" is a deliberate stub (click-to-source-PDF is out
// of MVP scope).
export function CellInspector({
  doc,
  col,
  cell,
  documents,
  busy,
  onRegenerate,
  onEditPrompt,
  onClose,
}: {
  doc: DocumentMeta;
  col: ReviewColumn;
  cell: CellResult | undefined;
  documents: DocumentMeta[];
  /** True while a "Run all" is in flight OR this cell is mid-regenerate. */
  busy: boolean;
  onRegenerate: () => void;
  onEditPrompt: () => void;
  onClose: () => void;
}) {
  const answer = cell?.status === "done" ? cell.answer : null;

  return (
    <div className="flex-none border-t border-border bg-panel">
      {/* Header: doc · column · confidence · close */}
      <div className="flex items-center gap-2.5 border-b border-border-soft px-5 py-2.5">
        <span className="truncate text-[12.5px] text-foreground">{docLabel(doc)}</span>
        <Icon name="chevRight" size={11} className="text-dim" />
        <span className="truncate text-[12.5px] font-medium text-foreground">{col.title}</span>
        {answer && (
          <span className="ml-1 inline-flex items-center gap-1.5 font-mono text-[10.5px] text-dim">
            <ConfidenceDot confidence={answer.confidence} />
            {answer.confidence.toFixed(2)}
          </span>
        )}
        <div className="flex-1" />
        <Btn variant="ghost" size="sm" icon="x" onClick={onClose}>
          Close
        </Btn>
      </div>

      {/* Body: answer (left) · prompt + actions (right) */}
      <div className="flex max-h-72 gap-6 overflow-auto px-5 py-4">
        <div className="min-w-0 flex-1">
          <div className="mb-1.5 font-mono text-[10px] uppercase tracking-[0.06em] text-dim">
            Answer
          </div>

          {cell?.status === "running" && (
            <div className="flex items-center gap-2 font-mono text-[12px] text-amber">
              <span className="inline-block size-[7px] animate-pulse rounded-full bg-amber" />
              Regenerating…
            </div>
          )}

          {cell?.status === "error" && (
            <div className="text-[12.5px] leading-[1.5] text-muted-foreground">
              <span className="mr-1.5 font-mono text-[10.5px] text-red">error</span>
              {cell.message}
            </div>
          )}

          {answer && (
            <>
              <div
                className={
                  "whitespace-pre-wrap text-[13.5px] leading-[1.6] text-foreground" +
                  (col.numeric ? " font-mono" : "")
                }
              >
                {answer.value}
              </div>
              {answer.citations.length > 0 ? (
                <div className="mt-3 space-y-2">
                  {answer.citations.map((c, i) => (
                    <div key={i}>
                      <Pill tone={c.verified ? "ctx" : "warn"} className="py-[3px]">
                        <Icon name="doc" size={10} />
                        {citationLabel(c, documents)}
                      </Pill>
                      <div className="mt-1 border-l-2 border-border-soft pl-2.5 font-mono text-[11px] leading-[1.5] text-dim">
                        {c.quote}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="mt-3 font-mono text-[10.5px] text-dim">No citations.</div>
              )}
            </>
          )}
        </div>

        {/* Right rail: the column's full prompt (transparent-prompts thesis) + actions */}
        <div className="w-72 shrink-0">
          <div className="mb-1.5 font-mono text-[10px] uppercase tracking-[0.06em] text-dim">
            Prompt
          </div>
          <div className="whitespace-pre-wrap rounded-[3px] border border-border-soft bg-bg px-2.5 py-2 font-mono text-[11px] leading-[1.5] text-muted-foreground">
            {col.prompt || "No prompt yet."}
          </div>
          <div className="mt-3 flex flex-wrap gap-1.5">
            <Btn variant="primary" size="sm" icon="refresh" disabled={busy} onClick={onRegenerate}>
              Regenerate
            </Btn>
            <Btn variant="ghost" size="sm" icon="edit" onClick={onEditPrompt}>
              Edit prompt
            </Btn>
            <Btn variant="ghost" size="sm" icon="eye" disabled title="Source view — coming soon">
              View source
            </Btn>
          </div>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vitest run src/components/review/cell-inspector.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/review/cell-inspector.tsx src/components/review/cell-inspector.test.tsx
git commit -m "feat: add Review cell inspector drawer"
```

---

## Task 5: Wire the inspector into ReviewScreen

Add selection state, the regenerate handler, selection invalidation (column deleted or row deselected), and render the drawer. Pass `selected`/`onSelect` into each `GridCell`.

**Files:**
- Modify: `src/components/review/review-screen.tsx`
- Test: `src/components/review/review-screen.test.tsx`

- [ ] **Step 1: Write the failing integration tests**

Append to `src/components/review/review-screen.test.tsx`:

```tsx
describe("ReviewScreen — inspector", () => {
  it("opens the inspector when a done cell is clicked and follows selection", async () => {
    const fetchMock = vi.fn().mockImplementation(async () => cellResponse("Delaware"));
    vi.stubGlobal("fetch", fetchMock);
    renderScreen([doc("d1")], ["d1"]);

    fireEvent.click(screen.getByRole("button", { name: /Run all/ }));
    await waitFor(() => expect(screen.getByText("6/6 complete")).toBeInTheDocument());

    // Click the first done cell (a button whose text contains the value).
    const cells = screen.getAllByRole("button", { name: /Delaware/ });
    fireEvent.click(cells[0]);

    // The inspector header shows the column title and the full prompt appears.
    expect(screen.getByRole("button", { name: /Regenerate/ })).toBeInTheDocument();
    expect(
      screen.getByText(/What is the governing law clause/),
    ).toBeInTheDocument();
  });

  it("regenerates the selected cell in place", async () => {
    let call = 0;
    const fetchMock = vi.fn().mockImplementation(async () => {
      call += 1;
      return cellResponse(call <= 6 ? "Delaware" : "New York");
    });
    vi.stubGlobal("fetch", fetchMock);
    renderScreen([doc("d1")], ["d1"]);

    fireEvent.click(screen.getByRole("button", { name: /Run all/ }));
    await waitFor(() => expect(screen.getByText("6/6 complete")).toBeInTheDocument());

    fireEvent.click(screen.getAllByRole("button", { name: /Delaware/ })[0]);
    fireEvent.click(screen.getByRole("button", { name: /Regenerate/ }));

    await waitFor(() => expect(screen.getByText("New York")).toBeInTheDocument());
  });

  it("closes the inspector when the selected column is deleted", async () => {
    const fetchMock = vi.fn().mockImplementation(async () => cellResponse("Delaware"));
    vi.stubGlobal("fetch", fetchMock);
    renderScreen([doc("d1")], ["d1"]);

    fireEvent.click(screen.getByRole("button", { name: /Run all/ }));
    await waitFor(() => expect(screen.getByText("6/6 complete")).toBeInTheDocument());

    fireEvent.click(screen.getAllByRole("button", { name: /Delaware/ })[0]);
    expect(screen.getByRole("button", { name: /Regenerate/ })).toBeInTheDocument();

    // Open the first column's editor and delete it.
    fireEvent.click(screen.getByText("Governing law"));
    fireEvent.click(screen.getByRole("button", { name: /Delete/ }));

    expect(screen.queryByRole("button", { name: /Regenerate/ })).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run src/components/review/review-screen.test.tsx`
Expected: FAIL — no inspector renders; no Regenerate button.

- [ ] **Step 3: Add selection state + handlers to `review-screen.tsx`**

In `src/components/review/review-screen.tsx`:

a) Extend the imports from `review-grid` and add the inspector import:

```tsx
import {
  cellKey,
  fetchCell,
  gridCounts,
  loadColumns,
  newColumn,
  regenerateCell,
  runGrid,
  saveColumns,
  STARTER_COLUMNS,
  type CellMap,
  type ReviewColumn,
} from "@/lib/review-grid";
import { CellInspector } from "./cell-inspector";
```

b) Add selection state next to the other `useState` hooks:

```tsx
const [selected, setSelected] = useState<{ docId: string; colId: string } | null>(null);
```

c) Add a `setCell` helper and refactor `handleRunAll`'s `onUpdate` to use it (keeps the update path identical between Run all and Regenerate):

```tsx
function setCell(docId: string, colId: string, result: CellResult) {
  setCells((prev) => ({ ...prev, [cellKey(docId, colId)]: result }));
}
```

Then in `handleRunAll`, replace the inline `onUpdate` with `onUpdate: setCell,`. (Add `type CellResult` to the `review-grid` import.)

d) Add the regenerate handler:

```tsx
async function handleRegenerate() {
  if (!selected || running) return;
  const col = columns.find((c) => c.id === selected.colId);
  if (!col) return;
  await regenerateCell({ docId: selected.docId, col, runCell: fetchCell, onUpdate: setCell });
}
```

e) Add selection invalidation — close the inspector if its column was deleted or its row deselected:

```tsx
useEffect(() => {
  if (!selected) return;
  const stillValid =
    docIds.includes(selected.docId) && columns.some((c) => c.id === selected.colId);
  if (!stillValid) setSelected(null);
}, [selected, docIds, columns]);
```

f) Derive the selected doc/column/cell for the drawer (near `const counts = ...`):

```tsx
const selectedDoc = selected ? docs.find((d) => d.id === selected.docId) : undefined;
const selectedCol = selected ? columns.find((c) => c.id === selected.colId) : undefined;
const selectedCell = selected ? cells[cellKey(selected.docId, selected.colId)] : undefined;
```

- [ ] **Step 4: Wire `GridCell` and render the drawer**

In the row-rendering map, pass selection props:

```tsx
{columns.map((col) => (
  <GridCell
    key={col.id}
    cell={cells[cellKey(doc.id, col.id)]}
    col={col}
    selected={selected?.docId === doc.id && selected?.colId === col.id}
    onSelect={() => setSelected({ docId: doc.id, colId: col.id })}
  />
))}
```

Then render the drawer just before the closing `</>` of the component (after the scrollable grid `</div>`):

```tsx
{selectedDoc && selectedCol && (
  <CellInspector
    doc={selectedDoc}
    col={selectedCol}
    cell={selectedCell}
    documents={documents}
    busy={running || selectedCell?.status === "running"}
    onRegenerate={() => void handleRegenerate()}
    onEditPrompt={() => setEditingColId(selectedCol.id)}
    onClose={() => setSelected(null)}
  />
)}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm vitest run src/components/review/review-screen.test.tsx`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/components/review/review-screen.tsx src/components/review/review-screen.test.tsx
git commit -m "feat: wire cell inspector + regenerate into Review screen"
```

---

## Task 6: Full verification + manual check

**Files:** none (verification only)

- [ ] **Step 1: Run the whole suite + typecheck + lint**

```bash
pnpm vitest run
pnpm tsc --noEmit
pnpm lint
```
Expected: all green. (`pnpm test` may map to `vitest run` — use whichever the repo defines; check `package.json` scripts.)

- [ ] **Step 2: Manual smoke test**

```bash
pnpm dev
```
- Select 1-2 docs in the sidebar, define/keep columns, click **Run all**.
- Click a `done` cell → drawer opens with the full value, confidence, citation + quote, and the full prompt; the cell shows the amber outline.
- Click another done cell → drawer follows the selection.
- Click **Regenerate** → the cell shows `running`, the drawer shows "Regenerating…", then both update with the fresh answer.
- Click **Edit prompt** → the column editor opens; change the prompt, **Done**, Run all again.
- **View source** is visibly disabled. **Close** dismisses the drawer.

- [ ] **Step 3: Record the review marker (after the implementation review passes)**

```bash
sha="$(git rev-parse HEAD)"
# set reviewed_sha: $sha in .claude/epics/mvp/14.md frontmatter
git add .claude/epics/mvp/14.md
git commit -m "chore: mark #14 reviewed at ${sha:0:7}"
```

Then **stop** — do **not** merge or finalize. Report that `.worktrees/14-cell-inspector-regenerate` is ready and the user should run `/pm:ship 14`.

---

## Acceptance criteria coverage

- *Selecting a done cell opens the inspector with value, confidence pill, citation pill* → Tasks 4 + 5 (GridCell button → `setSelected` → `CellInspector` renders value/confidence/citation).
- *Right column shows the full prompt for that column* → Task 4 (right rail renders `col.prompt` in full).
- *Regenerate re-runs the single cell and updates it in place* → Tasks 2 + 5 (`regenerateCell` + `handleRegenerate` via the shared `setCell`).
- *Active cell gets the amber outline; inspector updates as selection changes* → Tasks 3 + 5 (`selected` outline; drawer derives content from live state each render).
- *"View source" is a stub* → Task 4 (disabled button with a "coming soon" title).
