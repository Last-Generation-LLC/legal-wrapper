"use client";

import { useEffect, useState } from "react";
import { TopBar } from "@/components/layout/top-bar";
import { Btn } from "@/components/ui/btn";
import { EmptyState } from "@/components/ui/empty-state";
import { Icon } from "@/components/ui/icon";
import { useDocs } from "@/components/documents/docs-context";
import { docFormat, docLabel, formatTokens } from "@/lib/doc-display";
import {
  cellKey,
  fetchCell,
  gridCounts,
  loadColumns,
  loadModel,
  newColumn,
  regenerateCell,
  runGrid,
  saveColumns,
  saveModel,
  STARTER_COLUMNS,
  type CellMap,
  type CellResult,
  type ReviewColumn,
} from "@/lib/review-grid";
import { csvFilename, downloadCsv, gridToCsv } from "@/lib/review-csv";
import {
  cacheHitRate,
  formatCachePct,
  formatUsd,
  MODEL_PRICING,
  sumUsage,
  usageCostUsd,
  type TokenUsage,
} from "@/lib/pricing";
import { CellInspector } from "./cell-inspector";
import { ColumnHeader } from "./column-header";
import { GridCell } from "./grid-cell";
import { StatusBar } from "./status-bar";

const DOC_COL_WIDTH = 240;

/** One choice in the Review model picker (built server-side from the registry). */
export type ReviewModelOption = { id: string; label: string; rates?: string };

// The Review screen's single stateful entry — children are presentational.
// Rows are the shared sidebar selection (locked decision); columns and the
// model pick persist to localStorage; cell results are in-memory and reset on reload.
export function ReviewScreen({
  modelOptions,
  defaultModelId,
}: {
  modelOptions: ReviewModelOption[];
  defaultModelId: string;
}) {
  const { documents, selectedIds } = useDocs();
  const docs = documents.filter((d) => selectedIds.includes(d.id));
  const docIds = docs.map((d) => d.id);

  // Server render and first client render both show the starters; the user's
  // stored columns swap in after mount (localStorage doesn't exist during SSR,
  // and reading it pre-hydration would make the two renders disagree).
  const [columns, setColumns] = useState<ReviewColumn[]>(STARTER_COLUMNS);
  const [columnsLoaded, setColumnsLoaded] = useState(false);
  const [cells, setCells] = useState<CellMap>({});
  const [running, setRunning] = useState(false);
  const [editingColId, setEditingColId] = useState<string | null>(null);
  const [selected, setSelected] = useState<{ docId: string; colId: string } | null>(null);
  const [modelId, setModelId] = useState(defaultModelId);

  useEffect(() => {
    setColumns(loadColumns(window.localStorage));
    setModelId(loadModel(window.localStorage, modelOptions.map((o) => o.id), defaultModelId));
    setColumnsLoaded(true);
  }, [modelOptions, defaultModelId]);

  function changeModel(next: string) {
    setModelId(next);
    saveModel(window.localStorage, next);
  }

  // Every call in this screen goes to the picked model.
  const runCell = (docId: string, prompt: string) => fetchCell(docId, prompt, modelId);

  useEffect(() => {
    if (columnsLoaded) saveColumns(window.localStorage, columns);
  }, [columns, columnsLoaded]);

  // Derive whether the selection is still valid at render time so we avoid
  // a useEffect that calls setState (which the lint rule disallows). If the
  // selected column or doc no longer exists, treat it as null for this render.
  const effectiveSelected =
    selected &&
    docIds.includes(selected.docId) &&
    columns.some((c) => c.id === selected.colId)
      ? selected
      : null;

  function setCell(docId: string, colId: string, result: CellResult) {
    setCells((prev) => ({ ...prev, [cellKey(docId, colId)]: result }));
  }

  async function handleRunAll() {
    if (running) return;
    // Close any open column editor first (review finding): its inputs are not
    // individually disabled, so a panel left open could edit or delete a
    // column mid-run and desync the run's promptUsed bookkeeping — and the
    // disabled header toggle prevents reopening one until the run finishes.
    setEditingColId(null);
    setRunning(true);
    try {
      await runGrid({
        docIds,
        columns,
        cells,
        runCell,
        onUpdate: setCell,
        model: modelId,
      });
    } finally {
      setRunning(false);
    }
  }

  async function handleRegenerate() {
    if (!effectiveSelected || running) return;
    const col = columns.find((c) => c.id === effectiveSelected.colId);
    if (!col) return;
    await regenerateCell({ docId: effectiveSelected.docId, col, runCell, onUpdate: setCell });
  }

  // Exports the grid AS IT IS — running/idle cells come out empty, error
  // cells say so. No await, no API calls: it's a serialization of state.
  function handleExportCsv() {
    downloadCsv(gridToCsv(docs, columns, cells), csvFilename(new Date()));
  }

  function addColumn() {
    const col = newColumn();
    setColumns((cols) => [...cols, col]);
    setEditingColId(col.id);
  }

  function updateColumn(next: ReviewColumn) {
    setColumns((cols) => cols.map((c) => (c.id === next.id ? next : c)));
  }

  function deleteColumn(id: string) {
    setColumns((cols) => cols.filter((c) => c.id !== id));
    setEditingColId((current) => (current === id ? null : current));
  }

  const counts = gridCounts(docIds, columns, cells);

  // Per-run cost/cache: every done cell's real usage, summed. Idle/running/error
  // cells contribute nothing. Undefined figures hide the pills until something runs.
  const doneCells = Object.values(cells).filter(
    (c): c is Extract<CellResult, { status: "done" }> => c.status === "done",
  );
  const doneUsages: TokenUsage[] = doneCells.map((c) => c.usage);
  const runUsage = doneUsages.length > 0 ? sumUsage(doneUsages) : null;
  // Cost is priced PER CELL with the model that answered it (a grid can mix
  // models, and Haiku 5.5's rate depends on each call's prompt size). Any
  // unpriced cell hides the pill rather than showing a misleadingly low total.
  const allPriced = doneCells.every((c) => MODEL_PRICING[c.modelUsed ?? modelId]);
  const runCost =
    runUsage && allPriced
      ? formatUsd(doneCells.reduce((sum, c) => sum + usageCostUsd(c.usage, c.modelUsed ?? modelId), 0))
      : undefined;
  const runCachePct = runUsage ? formatCachePct(cacheHitRate(runUsage)) : undefined;

  const canRun = !running && docIds.length > 0 && columns.length > 0;

  const selectedDoc = effectiveSelected ? docs.find((d) => d.id === effectiveSelected.docId) : undefined;
  const selectedCol = effectiveSelected ? columns.find((c) => c.id === effectiveSelected.colId) : undefined;
  const selectedCell = effectiveSelected ? cells[cellKey(effectiveSelected.docId, effectiveSelected.colId)] : undefined;

  return (
    <>
      <TopBar
        crumbs={["~/workspaces", "Review"]}
        right={
          <div className="flex items-center gap-2">
            <select
              aria-label="Review model"
              title="Model for Review cells — price per million tokens, input / output"
              value={modelId}
              disabled={running}
              onChange={(e) => changeModel(e.target.value)}
              className="cursor-pointer rounded-[3px] border border-[oklch(0.5_0.08_78_/_0.4)] bg-[oklch(0.28_0.05_78_/_0.15)] px-2 py-0.5 font-mono text-[10.5px] font-medium leading-4 tracking-[0.02em] text-amber disabled:cursor-not-allowed disabled:opacity-60"
            >
              {modelOptions.map((o) => (
                <option key={o.id} value={o.id}>
                  ● {o.label}
                  {o.rates ? ` · ${o.rates}` : ""}
                </option>
              ))}
            </select>
            <div className="mx-1 h-[18px] w-px bg-border" />
            <Btn
              variant="ghost"
              size="sm"
              icon="download"
              disabled={docIds.length === 0 || columns.length === 0}
              onClick={handleExportCsv}
            >
              CSV
            </Btn>
            <Btn variant="primary" size="sm" icon="play" disabled={!canRun} onClick={() => void handleRunAll()}>
              {running ? "Running…" : "Run all"}
            </Btn>
          </div>
        }
      />
      <StatusBar rows={docIds.length} columns={columns.length} counts={counts} cost={runCost} cachePct={runCachePct} />

      <div className="flex-1 overflow-auto bg-bg">
        <div
          style={{
            minWidth: DOC_COL_WIDTH + columns.reduce((sum, c) => sum + c.width, 0) + 140,
          }}
        >
          {/* Column headers — sticky under the status bar while rows scroll */}
          <div className="sticky top-0 z-3 flex border-b border-border bg-bg">
            <div
              style={{ width: DOC_COL_WIDTH }}
              className="sticky left-0 z-4 flex shrink-0 items-center gap-2 border-r border-border bg-bg px-3.5 py-2.5"
            >
              <Icon name="lock" size={11} className="text-dim" />
              <span className="font-mono text-[10.5px] uppercase tracking-[0.08em] text-muted-foreground">
                Document
              </span>
            </div>
            {columns.map((col) => (
              <ColumnHeader
                key={col.id}
                col={col}
                editing={editingColId === col.id}
                disabled={running}
                onToggleEdit={() => setEditingColId((c) => (c === col.id ? null : col.id))}
                onChange={updateColumn}
                onDelete={() => deleteColumn(col.id)}
              />
            ))}
            <div className="flex flex-1 items-center px-3 py-2">
              <Btn variant="ghost" size="sm" icon="plus" disabled={running} onClick={addColumn}>
                Add column
              </Btn>
            </div>
          </div>

          {/* Rows — one per selected document */}
          {docs.map((doc) => (
            <div key={doc.id} className="flex border-b border-border-soft">
              <div
                style={{ width: DOC_COL_WIDTH }}
                className="sticky left-0 z-2 shrink-0 border-r border-border bg-bg px-3.5 py-3"
              >
                <div className="mb-0.5 break-all text-[12.5px] leading-[1.35] text-foreground">
                  {docLabel(doc)}
                </div>
                <div className="flex gap-1.5 font-mono text-[10px] text-dim">
                  <span>{docFormat(doc.mimeType)}</span>
                  <span>·</span>
                  <span>{formatTokens(doc.tokenCount, doc.tokenCountEstimated)}</span>
                </div>
              </div>
              {columns.map((col) => (
                <GridCell
                  key={col.id}
                  cell={cells[cellKey(doc.id, col.id)]}
                  col={col}
                  selected={effectiveSelected?.docId === doc.id && effectiveSelected?.colId === col.id}
                  onSelect={() => setSelected({ docId: doc.id, colId: col.id })}
                />
              ))}
              <div className="flex-1" />
            </div>
          ))}

          {/* "Add documents" points at the sidebar (locked decision). The
              empty states stack by precedence: no rows first (you select docs
              to get rows), then no columns (#18). With both rows and columns
              present, a quiet hint to add more rows sits under the grid. */}
          {docs.length === 0 ? (
            <EmptyState
              icon="doc"
              heading="No documents selected"
              hint="Select documents in the sidebar to add rows to the grid."
            />
          ) : columns.length === 0 ? (
            <EmptyState
              icon="grid"
              heading="No columns yet"
              hint="Add a prompt column to run across every selected document."
              action={{ label: "Add column", icon: "plus", onClick: addColumn }}
            />
          ) : (
            <div className="flex items-center gap-1.5 px-3.5 py-2.5 font-mono text-[10.5px] text-dim">
              <Icon name="plus" size={11} />
              Add documents — select them in the sidebar.
            </div>
          )}
        </div>
      </div>
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
    </>
  );
}
