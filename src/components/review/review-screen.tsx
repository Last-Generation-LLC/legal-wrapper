"use client";

import { useEffect, useState } from "react";
import { TopBar } from "@/components/layout/top-bar";
import { Btn } from "@/components/ui/btn";
import { EmptyState } from "@/components/ui/empty-state";
import { Icon } from "@/components/ui/icon";
import { Pill } from "@/components/ui/pill";
import { useDocs } from "@/components/documents/docs-context";
import { docFormat, docLabel, formatTokens } from "@/lib/doc-display";
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
  type CellResult,
  type ReviewColumn,
} from "@/lib/review-grid";
import { csvFilename, downloadCsv, gridToCsv } from "@/lib/review-csv";
import { cacheHitRate, formatCachePct, formatUsageCost, sumUsage, type TokenUsage } from "@/lib/pricing";
import { CellInspector } from "./cell-inspector";
import { ColumnHeader } from "./column-header";
import { GridCell } from "./grid-cell";
import { StatusBar } from "./status-bar";

const DOC_COL_WIDTH = 240;

// The Review screen's single stateful entry — children are presentational.
// Rows are the shared sidebar selection (locked decision); columns persist to
// localStorage; cell results are in-memory and reset on reload.
export function ReviewScreen({ modelLabel, modelId }: { modelLabel: string; modelId: string }) {
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

  useEffect(() => {
    setColumns(loadColumns(window.localStorage));
    setColumnsLoaded(true);
  }, []);

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
        runCell: fetchCell,
        onUpdate: setCell,
      });
    } finally {
      setRunning(false);
    }
  }

  async function handleRegenerate() {
    if (!effectiveSelected || running) return;
    const col = columns.find((c) => c.id === effectiveSelected.colId);
    if (!col) return;
    await regenerateCell({ docId: effectiveSelected.docId, col, runCell: fetchCell, onUpdate: setCell });
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
  const doneUsages: TokenUsage[] = Object.values(cells)
    .filter((c): c is Extract<CellResult, { status: "done" }> => c.status === "done")
    .map((c) => c.usage);
  const runUsage = doneUsages.length > 0 ? sumUsage(doneUsages) : null;
  // formatUsageCost returns undefined for an unpriced model, so the pill hides
  // rather than showing a misleading $0.00 (both figures move together).
  const runCost = runUsage ? formatUsageCost(runUsage, modelId) : undefined;
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
            <Pill tone="active">● {modelLabel}</Pill>
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
