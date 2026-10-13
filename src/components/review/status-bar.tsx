import { Pill } from "@/components/ui/pill";

// Handoff status bar: serif title + mono dimensions on the left; live progress
// (done/total, multi-segment bar, state pills) on the right. Counts come from
// gridCounts() so the bar can never disagree with the cells.
export function StatusBar({
  rows,
  columns,
  counts,
  cost,
  cachePct,
}: {
  rows: number;
  columns: number;
  counts: { total: number; done: number; running: number; error: number };
  /** Preformatted cost of current completed results (e.g. "$0.0123"); omitted when nothing has run. */
  cost?: string;
  /** Preformatted cache-hit percent (e.g. "42%"); omitted when nothing has run. */
  cachePct?: string;
}) {
  const pct = (n: number) => (counts.total === 0 ? 0 : (n / counts.total) * 100);

  return (
    <div className="flex items-center gap-4 border-b border-border-soft bg-bg px-5 py-2.5">
      <div>
        <div className="font-serif text-[17px] tracking-[-0.01em] text-foreground">Review</div>
        <div className="mt-px font-mono text-[10.5px] text-dim">
          {rows} rows × {columns} columns · {counts.total} cells
        </div>
      </div>
      <div className="flex-1" />

      <div className="flex items-center gap-2.5">
        <span className="font-mono text-[11px] text-muted-foreground">
          {counts.done}/{counts.total} complete
        </span>
        <div
          role="progressbar"
          aria-valuenow={counts.done}
          aria-valuemax={counts.total}
          className="flex h-[3px] w-40 overflow-hidden rounded-[2px] bg-panel-hi"
        >
          <div className="bg-green" style={{ width: `${pct(counts.done)}%` }} />
          <div className="bg-amber" style={{ width: `${pct(counts.running)}%` }} />
          <div className="bg-red" style={{ width: `${pct(counts.error)}%` }} />
        </div>
        {/* cost + cachePct are provided as a pair (or not at all) — a lone
            cache pill without a cost reads confusingly. */}
        {cost && (
          <Pill tone="default" title="Cost of the currently displayed completed results">
            {cost}
          </Pill>
        )}
        {cachePct && (
          <Pill tone="default" title="Share of input tokens served from cache">
            cache · {cachePct}
          </Pill>
        )}
        <Pill tone="ok">
          <span className="inline-block size-1.5 rounded-full bg-green" /> {counts.done} done
        </Pill>
        {counts.running > 0 && (
          <Pill tone="warn">
            <span className="inline-block size-1.5 animate-pulse rounded-full bg-amber" />{" "}
            {counts.running} running
          </Pill>
        )}
        {counts.error > 0 && (
          <Pill>
            <span className="inline-block size-1.5 rounded-full bg-red" /> {counts.error} error
          </Pill>
        )}
      </div>
    </div>
  );
}
