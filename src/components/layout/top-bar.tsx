import * as React from "react";

// 44px breadcrumb bar. `crumbs` render left (last is emphasized); `right` is a
// per-page slot (model pill, action buttons). Lives in the page, not the layout.
export function TopBar({
  crumbs,
  right,
}: {
  crumbs: string[];
  right?: React.ReactNode;
}) {
  return (
    <div className="flex h-11 shrink-0 items-center gap-3 border-b border-border bg-bg px-4">
      <div className="flex min-w-0 flex-1 items-center gap-2">
        {crumbs.map((c, i) => (
          <React.Fragment key={i}>
            {i > 0 && <span className="text-[11px] text-dim">/</span>}
            <span
              className={
                "truncate font-mono text-[11.5px] tracking-[0.01em] " +
                (i === crumbs.length - 1 ? "text-foreground" : "text-muted-foreground")
              }
            >
              {c}
            </span>
          </React.Fragment>
        ))}
      </div>
      {right}
    </div>
  );
}
