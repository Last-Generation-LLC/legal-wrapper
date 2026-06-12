import { Btn } from "@/components/ui/btn";
import { Icon } from "@/components/ui/icon";
import type { ReviewColumn } from "@/lib/review-grid";

// A prompt-column header: title + chevron + 2-line prompt preview (handoff),
// expanding to an anchored editor panel — rename, edit prompt, delete. The
// prompt IS the product surface here (transparent prompts thesis), so it's
// shown in full and edited in place, not hidden behind a settings page.
export function ColumnHeader({
  col,
  editing,
  disabled,
  onToggleEdit,
  onChange,
  onDelete,
}: {
  col: ReviewColumn;
  editing: boolean;
  /** True while a run is in flight — edits would desync the run's bookkeeping. */
  disabled: boolean;
  onToggleEdit: () => void;
  onChange: (col: ReviewColumn) => void;
  onDelete: () => void;
}) {
  return (
    <div style={{ width: col.width }} className="relative shrink-0 border-r border-border-soft">
      <button
        type="button"
        disabled={disabled}
        onClick={onToggleEdit}
        className="block w-full cursor-pointer px-3 py-2.5 text-left disabled:cursor-not-allowed"
      >
        <div className="mb-1 flex items-center gap-1.5">
          <span className="truncate text-[12.5px] font-medium tracking-[-0.005em] text-foreground">
            {col.title}
          </span>
          <Icon name="chevDown" size={10} className="shrink-0 text-dim" />
        </div>
        <div className="line-clamp-2 font-mono text-[10px] leading-[1.35] text-dim">
          {col.prompt || "No prompt yet — click to define one."}
        </div>
      </button>

      {editing && (
        <div className="absolute left-0 top-full z-10 mt-px w-[300px] rounded-[3px] border border-border bg-panel p-3 shadow-lg">
          <label className="mb-1 block font-mono text-[10px] uppercase tracking-[0.06em] text-dim">
            Column title
            <input
              value={col.title}
              onChange={(e) => onChange({ ...col, title: e.target.value })}
              className="mt-1 block w-full rounded-[3px] border border-border bg-panel-hi px-2 py-1.5 font-sans text-[12.5px] normal-case tracking-normal text-foreground outline-none focus:border-amber"
            />
          </label>
          <label className="mb-1 mt-2.5 block font-mono text-[10px] uppercase tracking-[0.06em] text-dim">
            Prompt (runs against each document)
            <textarea
              value={col.prompt}
              onChange={(e) => onChange({ ...col, prompt: e.target.value })}
              rows={4}
              className="mt-1 block w-full resize-none rounded-[3px] border border-border bg-panel-hi px-2 py-1.5 font-mono text-[11px] normal-case leading-[1.5] tracking-normal text-foreground outline-none focus:border-amber"
            />
          </label>
          <div className="mt-2.5 flex items-center justify-between">
            <Btn variant="ghost" size="sm" icon="x" className="text-red" onClick={onDelete}>
              Delete
            </Btn>
            <Btn variant="primary" size="sm" icon="check" onClick={onToggleEdit}>
              Done
            </Btn>
          </div>
        </div>
      )}
    </div>
  );
}
