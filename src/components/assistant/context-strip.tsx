import { Pill } from "@/components/ui/pill";
import { Icon } from "@/components/ui/icon";
import { docLabel } from "@/lib/doc-display";
import type { DocumentMeta } from "@/lib/documents";

// Handoff: the strip under the TopBar — "CONTEXT" label + one ctx (blue) pill
// per selected doc. Purely presentational; the parent passes the selected
// subset from useDocs(), so the strip tracks sidebar selection live. The
// cache-hit and cost pills on the strip's right side are #17's scope.
export function ContextStrip({ docs }: { docs: DocumentMeta[] }) {
  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-border-soft bg-bg px-5 py-2.5">
      <span className="mr-1 font-mono text-[10.5px] uppercase tracking-[0.06em] text-dim">
        Context
      </span>
      {docs.length === 0 ? (
        <span className="font-mono text-[10.5px] text-dim">
          no documents selected — answers will not be grounded
        </span>
      ) : (
        docs.map((d) => (
          <Pill key={d.id} tone="ctx">
            <Icon name="doc" size={10} />
            {docLabel(d)}
          </Pill>
        ))
      )}
    </div>
  );
}
