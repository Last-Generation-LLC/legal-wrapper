import { Pill } from "@/components/ui/pill";
import { Icon } from "@/components/ui/icon";
import { docLabel } from "@/lib/doc-display";
import type { DocumentMeta } from "@/lib/documents";

// Handoff: the strip under the TopBar — "CONTEXT" label + one ctx (blue) pill
// per selected doc. Purely presentational; the parent passes the selected
// subset from useDocs(), so the strip tracks sidebar selection live. The
// cache-hit and cost pills on the strip's right side are #17's scope.
export function ContextStrip({
  docs,
  cost,
  cacheHit,
}: {
  docs: DocumentMeta[];
  /** Preformatted per-message cost estimate (e.g. "$0.0420"); from the latest answer. */
  cost?: string;
  /** Preformatted cache-hit percent (e.g. "87%"); from the latest answer. */
  cacheHit?: string;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-border-soft bg-bg px-5 py-2.5">
      <span className="mr-1 font-mono text-[10.5px] uppercase tracking-[0.06em] text-dim">
        Context
      </span>
      {docs.length === 0 ? (
        <span className="font-mono text-[10.5px] text-dim">
          no documents selected — answering from general legal knowledge
        </span>
      ) : (
        docs.map((d) => (
          <Pill key={d.id} tone="ctx">
            <Icon name="doc" size={10} />
            {docLabel(d)}
          </Pill>
        ))
      )}
      {(cost || cacheHit) && (
        <div className="ml-auto flex items-center gap-2">
          {cost && (
            <Pill tone="default" title="Estimated cost per message (last answer)">
              est. {cost} / msg
            </Pill>
          )}
          {cacheHit && (
            <Pill tone="default" title="Share of input tokens served from cache (last answer)">
              cache hit · {cacheHit}
            </Pill>
          )}
        </div>
      )}
    </div>
  );
}
