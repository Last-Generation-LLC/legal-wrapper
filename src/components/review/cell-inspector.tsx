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
