"use client";

import { useEffect, useState } from "react";
import { TopBar } from "@/components/layout/top-bar";
import { Btn } from "@/components/ui/btn";
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
  runGrid,
  saveColumns,
  STARTER_COLUMNS,
  type CellMap,
  type ReviewColumn,
} from "@/lib/review-grid";
import { ColumnHeader } from "./column-header";
import { GridCell } from "./grid-cell";
import { StatusBar } from "./status-bar";

const DOC_COL_WIDTH = 240;

// The Review screen's single stateful entry — children are presentational.
// Rows are the shared sidebar selection (locked decision); columns persist to
// localStorage; cell results are in-memory and reset on reload.
export function ReviewScreen({ modelLabel }: { modelLabel: string }) {
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

  useEffect(() => {
    setColumns(loadColumns(window.localStorage));
    setColumnsLoaded(true);
  }, []);

  useEffect(() => {
    if (columnsLoaded) saveColumns(window.localStorage, columns);
  }, [columns, columnsLoaded]);

  async function handleRunAll() {
    if (running) return;
    setRunning(true);
    try {
      await runGrid({
        docIds,
        columns,
        cells,
        runCell: fetchCell,
        onUpdate: (docId, colId, result) =>
          setCells((prev) => ({ ...prev, [cellKey(docId, colId)]: result })),
      });
    } finally {
      setRunning(false);
    }
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
  const canRun = !running && docIds.length > 0 && columns.length > 0;

  return (
    <>
      <TopBar
        crumbs={["~/workspaces", "Review"]}
        right={
          <div className="flex items-center gap-2">
            <Pill tone="active">● {modelLabel}</Pill>
            <div className="mx-1 h-[18px] w-px bg-border" />
            <Btn variant="primary" size="sm" icon="play" disabled={!canRun} onClick={() => void handleRunAll()}>
              {running ? "Running…" : "Run all"}
            </Btn>
          </div>
        }
      />
      <StatusBar rows={docIds.length} columns={columns.length} counts={counts} />

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
                <GridCell key={col.id} cell={cells[cellKey(doc.id, col.id)]} col={col} />
              ))}
              <div className="flex-1" />
            </div>
          ))}

          {docs.length === 0 && (
            <div className="px-5 py-16 text-center font-mono text-[10.5px] leading-relaxed text-dim">
              Select documents in the sidebar to add rows.
            </div>
          )}
        </div>
      </div>
    </>
  );
}
