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
        aria-hidden="true"
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
