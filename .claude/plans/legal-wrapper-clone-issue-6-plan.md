# Document sidebar UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the 280px Assistant-surface document sidebar — workspace header + Upload, an in-context token meter, and a scrollable checkbox doc list — backed by an Assistant-scoped React context that owns the shared `selectedDocs` selection.

**Architecture:** A Server Component (`(workspace)/assistant/layout.tsx`) fetches document metadata directly via `prisma.document.findMany` and seeds a client `DocsProvider` (React Context) that holds the list + in-memory selection. The `DocSidebar` client component reads the context, renders the list of `DocRow`s, and uploads one file at a time to the existing `POST /api/upload`, calling `router.refresh()` on success to re-run the server fetch. Pure display helpers (format label, token formatting) live in a separate testable module. The future Assistant chat (#9) will read the same selection via `useDocs()`.

**Tech Stack:** Next.js 16 (App Router, Server + Client Components), React 19, TypeScript, Tailwind v4 (`@theme` tokens), Prisma 6 + SQLite, Vitest 3 (`node` default env; component tests opt into jsdom per-file), `@testing-library/react`.

---

## Decisions this plan implements (locked — do not re-litigate)

- **d1** Sidebar + `selectedDocs` are **Assistant-scoped**: `DocsProvider` + `DocSidebar` mount in a new `(workspace)/assistant/layout.tsx`. Not forced onto Review/Documents.
- **d2** Document list loaded by a **Server Component** calling `prisma.document.findMany` (metadata-only select, newest first); `router.refresh()` after upload. No new `GET /api/documents`.
- **d3** Metadata row = `{FORMAT} · {tokens}k tok` (FORMAT from `mimeType`); `~` prefix when `tokenCountEstimated`; label = `title ?? filename`. No page count / doc-type taxonomy.
- **d4** Header serif title is a static label ("Workspace"); mono sub-line is live `{N} documents · {total} tokens` over **all** docs.
- **d5** Meter = `selectedTokens / 180000`, clamped at 100%. Ceiling warning/error is #16 — out of scope here.
- **d6** `selectedDocs` is **in-memory only** (resets on reload; no DB/localStorage).
- **d7** Hidden `<input type="file" accept=".pdf,.docx">` triggered by the ghost Btn; **one file per POST**; multi-file deferred.
- **d8** Upload errors (400/413/422) surface as a **minimal inline message**, never a silent no-op. (Toast system is #17.)
- **d9** **Empty state**: list, meter, and counts render sensibly with zero documents.
- **d10** (context) Reuse `Btn`/`Icon`/`icons`, the dark tokens, and the per-file jsdom test setup. No new primitives; do not restyle the shell.

## File Structure

- `src/lib/doc-display.ts` (new) — pure display helpers: `docFormat`, `formatTokens`, `docLabel`. No React, no I/O → fast `node`-env tests. [d3]
- `src/lib/documents.ts` (new) — `DocumentMeta` type + `listDocuments()` server query. The single place that reads the doc list from the DB. [d2, d4]
- `src/components/documents/docs-context.tsx` (new) — `"use client"` `DocsProvider` + `useDocs()`. Holds `documents` (from props) + `selectedIds` (in-memory state) and derives counts/tokens. [d1, d4, d5, d6]
- `src/components/documents/doc-row.tsx` (new) — one selectable list row (checkbox + label + metadata + selected styling). Presentational. [d3]
- `src/components/documents/doc-sidebar.tsx` (new) — `"use client"` the 280px column: header, meter, list, empty state, upload + inline error. [d4, d5, d7, d8, d9]
- `src/app/(workspace)/assistant/layout.tsx` (new) — Server Component: `listDocuments()` → `DocsProvider` wrapping `DocSidebar` + page `children`. [d1, d2]

Tests sit beside each source file (`*.test.ts` / `*.test.tsx`), matching the existing convention (`rail.test.tsx`, `btn.test.tsx`).

---

### Task 1: Display helpers (`doc-display.ts`)

**Files:**
- Create: `src/lib/doc-display.ts`
- Test: `src/lib/doc-display.test.ts`

These are pure functions, so the test runs in the default `node` env (no jsdom directive). They reuse the MIME constants already exported by the upload pipeline (`src/lib/extract.ts` exports `PDF_MIME`, `DOCX_MIME`).

- [ ] **Step 1: Write the failing test**

Create `src/lib/doc-display.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { PDF_MIME, DOCX_MIME } from "@/lib/extract";
import { docFormat, formatTokens, docLabel } from "@/lib/doc-display";

describe("docFormat", () => {
  it("maps known MIME types to short uppercase labels", () => {
    expect(docFormat(PDF_MIME)).toBe("PDF");
    expect(docFormat(DOCX_MIME)).toBe("DOCX");
  });
  it("falls back to FILE for anything else", () => {
    expect(docFormat("application/octet-stream")).toBe("FILE");
  });
});

describe("formatTokens", () => {
  it("formats thousands to one decimal with a 'k tok' suffix", () => {
    expect(formatTokens(31420, false)).toBe("31.4k tok");
  });
  it("prefixes a tilde when the count is an estimate", () => {
    expect(formatTokens(31420, true)).toBe("~31.4k tok");
  });
});

describe("docLabel", () => {
  it("prefers the friendly title", () => {
    expect(docLabel({ title: "Master Agreement", filename: "msa_v4.pdf" })).toBe("Master Agreement");
  });
  it("falls back to the filename when title is null", () => {
    expect(docLabel({ title: null, filename: "msa_v4.pdf" })).toBe("msa_v4.pdf");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/lib/doc-display.test.ts`
Expected: FAIL — "Failed to resolve import '@/lib/doc-display'".

- [ ] **Step 3: Write minimal implementation**

Create `src/lib/doc-display.ts`:

```ts
import { PDF_MIME, DOCX_MIME } from "@/lib/extract";

// Short uppercase format badge derived from the stored MIME type. We have no
// doc-type taxonomy (MSA/DPA/…) in the schema, so format is the honest label.
export function docFormat(mimeType: string): string {
  if (mimeType === PDF_MIME) return "PDF";
  if (mimeType === DOCX_MIME) return "DOCX";
  return "FILE";
}

// "31.4k tok", or "~31.4k tok" when the count is a char-based estimate (the
// live Anthropic count failed at upload time — see Document.tokenCountEstimated).
export function formatTokens(tokenCount: number, estimated: boolean): string {
  return `${estimated ? "~" : ""}${(tokenCount / 1000).toFixed(1)}k tok`;
}

// Friendly display name: the optional title, else the original filename.
export function docLabel(doc: { title: string | null; filename: string }): string {
  return doc.title ?? doc.filename;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run src/lib/doc-display.test.ts`
Expected: PASS (7 assertions).

- [ ] **Step 5: Commit**

```bash
git add src/lib/doc-display.ts src/lib/doc-display.test.ts
git commit -m "feat: add document display helpers (format, tokens, label)"
```

---

### Task 2: Document list server helper (`documents.ts`)

**Files:**
- Create: `src/lib/documents.ts`
- Test: `src/lib/documents.test.ts`

`listDocuments()` is the one place that reads the list. It selects **metadata only** (never `extractedText`) and orders newest-first, mirroring the metadata shape `/api/upload` returns. Test in `node` env with the Prisma client mocked.

- [ ] **Step 1: Write the failing test**

Create `src/lib/documents.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the Prisma singleton before importing the module under test.
vi.mock("@/lib/prisma", () => ({
  prisma: { document: { findMany: vi.fn() } },
}));

import { prisma } from "@/lib/prisma";
import { listDocuments } from "@/lib/documents";

describe("listDocuments", () => {
  beforeEach(() => vi.clearAllMocks());

  it("selects metadata only, newest first, and never the extracted text", async () => {
    const rows = [{ id: "d1", filename: "a.pdf", title: null, mimeType: "application/pdf", tokenCount: 100, tokenCountEstimated: false, createdAt: new Date() }];
    vi.mocked(prisma.document.findMany).mockResolvedValue(rows as never);

    const result = await listDocuments();

    expect(result).toEqual(rows);
    const arg = vi.mocked(prisma.document.findMany).mock.calls[0][0];
    expect(arg?.orderBy).toEqual({ createdAt: "desc" });
    expect(arg?.select).toMatchObject({
      id: true, filename: true, title: true, mimeType: true,
      tokenCount: true, tokenCountEstimated: true, createdAt: true,
    });
    // The heavy full text must not be pulled into the list query.
    expect((arg?.select as Record<string, boolean>).extractedText).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/lib/documents.test.ts`
Expected: FAIL — "Failed to resolve import '@/lib/documents'".

- [ ] **Step 3: Write minimal implementation**

Create `src/lib/documents.ts`:

```ts
import { prisma } from "@/lib/prisma";

// Metadata-only view of a Document — the shape the sidebar needs. Mirrors the
// fields `/api/upload` returns; deliberately excludes the heavy extractedText.
export type DocumentMeta = {
  id: string;
  filename: string;
  title: string | null;
  mimeType: string;
  tokenCount: number;
  tokenCountEstimated: boolean;
  createdAt: Date;
};

// Read the full document list for the sidebar. Server-only (touches Prisma);
// called from the Assistant layout Server Component and re-run by router.refresh().
export async function listDocuments(): Promise<DocumentMeta[]> {
  return prisma.document.findMany({
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      filename: true,
      title: true,
      mimeType: true,
      tokenCount: true,
      tokenCountEstimated: true,
      createdAt: true,
    },
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run src/lib/documents.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/documents.ts src/lib/documents.test.ts
git commit -m "feat: add listDocuments server helper (metadata-only, newest first)"
```

---

### Task 3: Docs context provider (`docs-context.tsx`)

**Files:**
- Create: `src/components/documents/docs-context.tsx`
- Test: `src/components/documents/docs-context.test.tsx`

The provider receives `documents` as a **prop** (from the server) and holds only `selectedIds` in `useState`, so a post-upload `router.refresh()` flows a fresh list down without wiping the selection. It derives `selectedCount`/`selectedTokens` (over selected docs) and `totalCount`/`totalTokens` (over all docs, for the header). Selection filters against the current `documents`, so a selected id that disappears simply drops out of the totals.

- [ ] **Step 1: Write the failing test**

Create `src/components/documents/docs-context.test.tsx`:

```tsx
// @vitest-environment jsdom
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import type { DocumentMeta } from "@/lib/documents";
import { DocsProvider, useDocs } from "./docs-context";

const doc = (id: string, tokenCount: number): DocumentMeta => ({
  id, filename: `${id}.pdf`, title: null, mimeType: "application/pdf",
  tokenCount, tokenCountEstimated: false, createdAt: new Date(),
});

function Probe() {
  const { selectedCount, selectedTokens, totalCount, totalTokens, toggle, ceiling } = useDocs();
  return (
    <div>
      <span data-testid="sel-count">{selectedCount}</span>
      <span data-testid="sel-tokens">{selectedTokens}</span>
      <span data-testid="total-count">{totalCount}</span>
      <span data-testid="total-tokens">{totalTokens}</span>
      <span data-testid="ceiling">{ceiling}</span>
      <button onClick={() => toggle("a")}>toggle-a</button>
    </div>
  );
}

describe("DocsProvider", () => {
  it("derives totals over all docs and selection over selected docs", () => {
    render(
      <DocsProvider documents={[doc("a", 1000), doc("b", 2000)]}>
        <Probe />
      </DocsProvider>,
    );
    // Nothing selected yet.
    expect(screen.getByTestId("sel-count").textContent).toBe("0");
    expect(screen.getByTestId("sel-tokens").textContent).toBe("0");
    expect(screen.getByTestId("total-count").textContent).toBe("2");
    expect(screen.getByTestId("total-tokens").textContent).toBe("3000");
    expect(screen.getByTestId("ceiling").textContent).toBe("180000");

    // Select doc "a".
    fireEvent.click(screen.getByText("toggle-a"));
    expect(screen.getByTestId("sel-count").textContent).toBe("1");
    expect(screen.getByTestId("sel-tokens").textContent).toBe("1000");

    // Toggling again deselects.
    fireEvent.click(screen.getByText("toggle-a"));
    expect(screen.getByTestId("sel-count").textContent).toBe("0");
  });

  it("throws if useDocs is called outside a provider", () => {
    function Bare() {
      useDocs();
      return null;
    }
    expect(() => render(<Bare />)).toThrow(/useDocs must be used within a DocsProvider/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/components/documents/docs-context.test.tsx`
Expected: FAIL — cannot resolve `./docs-context`.

- [ ] **Step 3: Write minimal implementation**

Create `src/components/documents/docs-context.tsx`:

```tsx
"use client";

import { createContext, useContext, useMemo, useState } from "react";
import type { DocumentMeta } from "@/lib/documents";

// No-RAG context budget: the whole selected doc set is sent on every call, so
// ~180k tokens is the practical ceiling. Ceiling *enforcement* (warn/block) is #16.
const CONTEXT_CEILING = 180_000;

type DocsContextValue = {
  documents: DocumentMeta[];
  selectedIds: string[];
  toggle: (id: string) => void;
  selectedCount: number;
  selectedTokens: number;
  totalCount: number;
  totalTokens: number;
  ceiling: number;
};

const DocsContext = createContext<DocsContextValue | null>(null);

export function DocsProvider({
  documents,
  children,
}: {
  documents: DocumentMeta[];
  children: React.ReactNode;
}) {
  // Selection is in-memory only (d6): it resets on reload and is intentionally
  // NOT persisted. `documents` comes from the server via props, so a post-upload
  // router.refresh() updates the list while this selection survives.
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const value = useMemo<DocsContextValue>(() => {
    const toggle = (id: string) =>
      setSelectedIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]));
    const selected = documents.filter((d) => selectedIds.includes(d.id));
    return {
      documents,
      selectedIds,
      toggle,
      selectedCount: selected.length,
      selectedTokens: selected.reduce((sum, d) => sum + d.tokenCount, 0),
      totalCount: documents.length,
      totalTokens: documents.reduce((sum, d) => sum + d.tokenCount, 0),
      ceiling: CONTEXT_CEILING,
    };
  }, [documents, selectedIds]);

  return <DocsContext.Provider value={value}>{children}</DocsContext.Provider>;
}

export function useDocs(): DocsContextValue {
  const ctx = useContext(DocsContext);
  if (!ctx) throw new Error("useDocs must be used within a DocsProvider");
  return ctx;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run src/components/documents/docs-context.test.tsx`
Expected: PASS (both cases). (React logs an expected error for the throw case — that's fine.)

- [ ] **Step 5: Commit**

```bash
git add src/components/documents/docs-context.tsx src/components/documents/docs-context.test.tsx
git commit -m "feat: add DocsProvider context for shared document selection"
```

---

### Task 4: Document row (`doc-row.tsx`)

**Files:**
- Create: `src/components/documents/doc-row.tsx`
- Test: `src/components/documents/doc-row.test.tsx`

One selectable row, rendered as a `<button>` (gives `role="button"` + `aria-pressed` for free, better than a clickable `<div>`). Shows the bespoke 14px amber checkbox (handoff), the label, and the `{FORMAT} · {tokens}` metadata. Selected rows get `bg-panel-hi` + `border-border-soft`. Reuses `Icon` and the display helpers — no new primitive.

- [ ] **Step 1: Write the failing test**

Create `src/components/documents/doc-row.test.tsx`:

```tsx
// @vitest-environment jsdom
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import type { DocumentMeta } from "@/lib/documents";
import { DocRow } from "./doc-row";

const doc: DocumentMeta = {
  id: "d1", filename: "Aperture_MSA_v4.pdf", title: null,
  mimeType: "application/pdf", tokenCount: 31420,
  tokenCountEstimated: false, createdAt: new Date(),
};

describe("DocRow", () => {
  it("renders the label and FORMAT · tokens metadata", () => {
    render(<DocRow doc={doc} selected={false} onToggle={() => {}} />);
    expect(screen.getByText("Aperture_MSA_v4.pdf")).toBeInTheDocument();
    expect(screen.getByText("PDF")).toBeInTheDocument();
    expect(screen.getByText("31.4k tok")).toBeInTheDocument();
  });

  it("reflects selected state via aria-pressed and the panel-hi background", () => {
    render(<DocRow doc={doc} selected={true} onToggle={() => {}} />);
    const row = screen.getByRole("button");
    expect(row).toHaveAttribute("aria-pressed", "true");
    expect(row).toHaveClass("bg-panel-hi");
  });

  it("calls onToggle when clicked", () => {
    const onToggle = vi.fn();
    render(<DocRow doc={doc} selected={false} onToggle={onToggle} />);
    fireEvent.click(screen.getByRole("button"));
    expect(onToggle).toHaveBeenCalledOnce();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/components/documents/doc-row.test.tsx`
Expected: FAIL — cannot resolve `./doc-row`.

- [ ] **Step 3: Write minimal implementation**

Create `src/components/documents/doc-row.tsx`:

```tsx
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/utils";
import type { DocumentMeta } from "@/lib/documents";
import { docFormat, formatTokens, docLabel } from "@/lib/doc-display";

export function DocRow({
  doc,
  selected,
  onToggle,
}: {
  doc: DocumentMeta;
  selected: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={selected}
      className={cn(
        "mb-px flex w-full gap-2.5 rounded-[3px] border px-2 py-[9px] text-left",
        selected ? "border-border-soft bg-panel-hi" : "border-transparent",
      )}
    >
      {/* bespoke 14px checkbox (handoff) — amber fill + check glyph when on */}
      <span
        className={cn(
          "mt-0.5 flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-[2px] border",
          selected ? "border-amber bg-amber" : "border-border",
        )}
      >
        {selected && <Icon name="check" size={9} strokeWidth={3} className="text-bg" />}
      </span>
      <span className="min-w-0 flex-1">
        <span
          className={cn(
            "mb-0.5 block break-all text-[12.5px] leading-[1.3]",
            selected ? "text-foreground" : "text-muted-foreground",
          )}
        >
          {docLabel(doc)}
        </span>
        <span className="flex gap-2 font-mono text-[10px] text-dim">
          <span>{docFormat(doc.mimeType)}</span>
          <span>·</span>
          <span>{formatTokens(doc.tokenCount, doc.tokenCountEstimated)}</span>
        </span>
      </span>
    </button>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run src/components/documents/doc-row.test.tsx`
Expected: PASS (3 cases).

- [ ] **Step 5: Commit**

```bash
git add src/components/documents/doc-row.tsx src/components/documents/doc-row.test.tsx
git commit -m "feat: add DocRow selectable document list row"
```

---

### Task 5: Document sidebar (`doc-sidebar.tsx`)

**Files:**
- Create: `src/components/documents/doc-sidebar.tsx`
- Test: `src/components/documents/doc-sidebar.test.tsx`

The 280px column. Reads `useDocs()` for the list + counts + meter math, renders the header (static "Workspace" title + live `{N} documents · {total} tokens`), the In-Context meter (`selectedTokens / 180000`, clamped), the scrollable `DocRow` list or an empty state, and the Upload control: a ghost `Btn` that clicks a hidden `<input type="file" accept=".pdf,.docx">`, POSTs one file to `/api/upload`, and on success calls `router.refresh()`. On a non-OK response it shows the route's `error` message inline (`role="alert"`).

The test mocks `next/navigation` (for `useRouter().refresh`) and `global.fetch`. Wrap the component in `DocsProvider` so `useDocs()` resolves.

- [ ] **Step 1: Write the failing test**

Create `src/components/documents/doc-sidebar.test.tsx`:

```tsx
// @vitest-environment jsdom
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { DocumentMeta } from "@/lib/documents";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

import { DocsProvider } from "./docs-context";
import { DocSidebar } from "./doc-sidebar";

const doc = (id: string, tokenCount: number): DocumentMeta => ({
  id, filename: `${id}.pdf`, title: null, mimeType: "application/pdf",
  tokenCount, tokenCountEstimated: false, createdAt: new Date(),
});

function renderSidebar(documents: DocumentMeta[]) {
  return render(
    <DocsProvider documents={documents}>
      <DocSidebar />
    </DocsProvider>,
  );
}

describe("DocSidebar", () => {
  beforeEach(() => {
    refresh.mockClear();
    vi.restoreAllMocks();
  });

  it("shows the live header count/token total and an empty state with no docs", () => {
    renderSidebar([]);
    expect(screen.getByText("0 documents · 0 tokens")).toBeInTheDocument();
    expect(screen.getByText(/No documents yet/i)).toBeInTheDocument();
  });

  it("lists documents and updates the in-context count when a row is toggled", () => {
    renderSidebar([doc("a", 1000), doc("b", 2000)]);
    expect(screen.getByText("2 documents · 3,000 tokens")).toBeInTheDocument();
    expect(screen.getByText("In Context · 0")).toBeInTheDocument();
    fireEvent.click(screen.getByText("a.pdf"));
    expect(screen.getByText("In Context · 1")).toBeInTheDocument();
  });

  it("uploads the chosen file and refreshes on success", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 201, json: async () => ({ id: "x" }) });
    vi.stubGlobal("fetch", fetchMock);
    renderSidebar([]);

    const input = screen.getByTestId("upload-input") as HTMLInputElement;
    const file = new File(["%PDF-1.4"], "new.pdf", { type: "application/pdf" });
    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => expect(refresh).toHaveBeenCalledOnce());
    expect(fetchMock).toHaveBeenCalledWith("/api/upload", expect.objectContaining({ method: "POST" }));
  });

  it("surfaces the API error message inline and does not refresh on failure", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false, status: 422, json: async () => ({ error: "Could not extract text from this PDF." }),
    });
    vi.stubGlobal("fetch", fetchMock);
    renderSidebar([]);

    const input = screen.getByTestId("upload-input") as HTMLInputElement;
    const file = new File(["bad"], "scan.pdf", { type: "application/pdf" });
    fireEvent.change(input, { target: { files: [file] } });

    expect(await screen.findByRole("alert")).toHaveTextContent("Could not extract text from this PDF.");
    expect(refresh).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/components/documents/doc-sidebar.test.tsx`
Expected: FAIL — cannot resolve `./doc-sidebar`.

- [ ] **Step 3: Write minimal implementation**

Create `src/components/documents/doc-sidebar.tsx`:

```tsx
"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Btn } from "@/components/ui/btn";
import { useDocs } from "./docs-context";
import { DocRow } from "./doc-row";

export function DocSidebar() {
  const {
    documents, selectedIds, toggle,
    selectedCount, selectedTokens, totalCount, totalTokens, ceiling,
  } = useDocs();
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // d5: fill fraction, clamped at 100%. No warn/block here — that's #16.
  const meterPct = Math.min(100, (selectedTokens / ceiling) * 100);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // reset so the same file can be re-picked later
    if (!file) return;

    setUploading(true);
    setError(null);
    try {
      const body = new FormData();
      body.append("file", file); // d7: single file per POST
      const res = await fetch("/api/upload", { method: "POST", body });
      if (!res.ok) {
        // d8: surface the route's 400/413/422 { error } inline, never silently.
        const data = await res.json().catch(() => null);
        setError(data?.error ?? `Upload failed (${res.status}).`);
        return;
      }
      router.refresh(); // d2: re-run the server fetch so the new doc appears
    } catch {
      setError("Upload failed — check your connection and try again.");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="flex w-[280px] shrink-0 flex-col border-r border-border bg-bg">
      {/* Header — static title (d4), live doc/token sub-line, Upload */}
      <div className="border-b border-border-soft px-3.5 pb-2.5 pt-3.5">
        <div className="mb-2.5 flex items-center justify-between">
          <span className="font-mono text-[10.5px] uppercase tracking-[0.08em] text-muted-foreground">
            Workspace
          </span>
          <Btn variant="ghost" size="sm" icon="upload" disabled={uploading} onClick={() => inputRef.current?.click()}>
            {uploading ? "Uploading…" : "Upload"}
          </Btn>
          <input
            ref={inputRef}
            data-testid="upload-input"
            type="file"
            accept=".pdf,.docx"
            className="hidden"
            onChange={onFile}
          />
        </div>
        <div className="mb-0.5 font-serif text-[18px] tracking-[-0.01em] text-foreground">Workspace</div>
        <div className="font-mono text-[10.5px] text-dim">
          {totalCount} documents · {totalTokens.toLocaleString()} tokens
        </div>
      </div>

      {error && (
        <div role="alert" className="border-b border-border-soft bg-panel px-3.5 py-2 font-mono text-[10.5px] text-red">
          {error}
        </div>
      )}

      {/* In-context label + meter (d5) */}
      <div className="flex items-center justify-between px-3.5 pb-2 pt-2.5">
        <span className="font-mono text-[10.5px] uppercase tracking-[0.08em] text-muted-foreground">
          In Context · {selectedCount}
        </span>
        <span className="font-mono text-[10.5px] text-dim">
          {(selectedTokens / 1000).toFixed(1)}k / 180k
        </span>
      </div>
      <div className="px-3.5 pb-2.5">
        <div className="h-[3px] overflow-hidden rounded-[2px] bg-panel-hi">
          <div className="h-full bg-amber" style={{ width: `${meterPct}%` }} />
        </div>
      </div>

      {/* Scrollable list or empty state (d9) */}
      <div className="flex-1 overflow-y-auto px-2 pb-3.5">
        {documents.length === 0 ? (
          <div className="px-2 py-8 text-center font-mono text-[10.5px] leading-relaxed text-dim">
            No documents yet. Upload a PDF or DOCX to begin.
          </div>
        ) : (
          documents.map((d) => (
            <DocRow key={d.id} doc={d} selected={selectedIds.includes(d.id)} onToggle={() => toggle(d.id)} />
          ))
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run src/components/documents/doc-sidebar.test.tsx`
Expected: PASS (4 cases).

- [ ] **Step 5: Commit**

```bash
git add src/components/documents/doc-sidebar.tsx src/components/documents/doc-sidebar.test.tsx
git commit -m "feat: add DocSidebar (header, meter, list, upload, empty + error states)"
```

---

### Task 6: Wire the sidebar into the Assistant route + verify the whole feature

**Files:**
- Create: `src/app/(workspace)/assistant/layout.tsx`

This Server Component fetches the list once and seeds the provider, placing the sidebar to the left of the Assistant page (which keeps its own `TopBar`). Server-component async layouts aren't unit-tested here (the meaningful logic is already covered in Tasks 1–5); this task verifies the integration via type-check, the full suite, a production build, and a manual smoke check.

- [ ] **Step 1: Create the Assistant layout**

Create `src/app/(workspace)/assistant/layout.tsx`:

```tsx
import { listDocuments } from "@/lib/documents";
import { DocsProvider } from "@/components/documents/docs-context";
import { DocSidebar } from "@/components/documents/doc-sidebar";

// Assistant-scoped shell (d1): the document sidebar lives here, not in the
// global (workspace) layout — Review has its own layout. The Server Component
// seeds the client provider with the list (d2); the future Assistant chat (#9)
// reads the same selection via useDocs().
export default async function AssistantLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const documents = await listDocuments();
  return (
    <DocsProvider documents={documents}>
      <div className="flex min-w-0 flex-1">
        <DocSidebar />
        <div className="flex min-w-0 flex-1 flex-col">{children}</div>
      </div>
    </DocsProvider>
  );
}
```

- [ ] **Step 2: Type-check**

Run: `pnpm exec tsc --noEmit`
Expected: exit 0, no errors. (If `border-border-soft` or any token class were wrong it would not surface here — the `next build` in Step 4 is the authority for Tailwind class generation.)

- [ ] **Step 3: Run the full test suite**

Run: `pnpm vitest run`
Expected: PASS — all prior suites plus the 4 new files (doc-display, documents, docs-context, doc-row, doc-sidebar) green.

- [ ] **Step 4: Production build (authoritative for Tailwind + RSC boundaries)**

Run: `pnpm build`
Expected: build succeeds. This compiles the new Tailwind utility classes (`border-border-soft`, `text-red`, `text-bg`, `bg-amber`) and validates the Server/Client Component boundary (async layout → client `DocsProvider`).

- [ ] **Step 5: Manual smoke check**

Run: `pnpm dev`, open `/assistant`. Confirm:
- The 280px sidebar renders left of the chat area; the Rail is still left of that; the `TopBar` sits above the chat only (not above the sidebar).
- Empty DB → "No documents yet" placeholder; header reads "0 documents · 0 tokens".
- Click **Upload**, pick a PDF/DOCX → the list refreshes with the new row; header count/tokens update.
- Pick an unsupported file (e.g. `.txt` forced through, or a scanned PDF) → an inline red error appears, no row added.
- Click rows → checkbox fills amber, row highlights, "In Context · N" and the amber meter update live.

- [ ] **Step 6: Commit**

```bash
git add "src/app/(workspace)/assistant/layout.tsx"
git commit -m "feat: mount document sidebar in the Assistant route layout"
```

---

## Self-Review notes

- **Spec coverage:** d1→Tasks 3+6; d2→Tasks 2+5+6; d3→Tasks 1+4; d4→Tasks 3+5; d5→Tasks 3+5; d6→Task 3; d7→Task 5; d8→Task 5; d9→Task 5; d10 (context)→reused throughout (Btn/Icon/tokens, jsdom setup). All acceptance criteria mapped.
- **No new primitives** — `Btn`, `Icon`, `cn`, and the design tokens are reused; the 14px checkbox is bespoke inline markup, consistent with the handoff.
- **Type consistency:** `DocumentMeta` is defined once in `documents.ts` and imported everywhere; `useDocs()` returns the single `DocsContextValue` shape consumed by the sidebar.
- **Known gap (acknowledged, not a defect):** the async Server Component layout has no unit test (awkward under Vitest); it's covered by `tsc`, `next build`, and the manual smoke check, with all branching logic unit-tested in the client pieces.
