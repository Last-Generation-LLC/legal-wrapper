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
