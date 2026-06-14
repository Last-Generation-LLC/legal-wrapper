"use client";

import { useRef } from "react";
import { Btn } from "@/components/ui/btn";
import { EmptyState } from "@/components/ui/empty-state";
import { ceilingState, compactTokens, type CeilingState } from "@/lib/context-ceiling";
import { useDocs } from "./docs-context";
import { useUpload } from "./use-upload";
import { DocRow } from "./doc-row";

// #16 guardrail colors: the meter keeps the handoff's amber accent through
// the warn band and turns red past the ceiling; the count text follows so
// the state is legible without the meter.
const METER_BG: Record<CeilingState, string> = {
  ok: "bg-amber",
  warn: "bg-amber",
  over: "bg-red",
};
const COUNT_TEXT: Record<CeilingState, string> = {
  ok: "text-dim",
  warn: "text-amber",
  over: "text-red",
};

export function DocSidebar() {
  const {
    documents, selectedIds, toggle,
    selectedCount, selectedTokens, totalCount, totalTokens, ceiling,
  } = useDocs();
  const inputRef = useRef<HTMLInputElement>(null);
  const { upload, uploading } = useUpload();

  // Fill fraction, clamped at 100%; color carries the over-100% signal.
  const meterPct = Math.min(100, (selectedTokens / ceiling) * 100);
  const state = ceilingState(selectedTokens);

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // reset so the same file can be re-picked later
    if (file) void upload(file);
  }

  return (
    <div className="flex w-[280px] shrink-0 flex-col border-r border-border bg-bg">
      {/* Header — static title (d4), live doc/token sub-line, Upload */}
      <div className="border-b border-border-soft px-3.5 pb-2.5 pt-3.5">
        <div className="mb-2.5 flex items-center justify-between">
          <span className="font-mono text-[10.5px] uppercase tracking-[0.08em] text-muted-foreground">
            Workspace
          </span>
          <Btn variant="ghost" size="sm" icon="upload" disabled={uploading} onClick={() => inputRef.current?.click()}>
            {uploading ? "Uploading…" : "Upload"}
          </Btn>
          <input
            ref={inputRef}
            data-testid="upload-input"
            type="file"
            accept=".pdf,.docx"
            className="hidden"
            onChange={onFile}
          />
        </div>
        <div className="mb-0.5 font-serif text-[18px] tracking-[-0.01em] text-foreground">Workspace</div>
        <div className="font-mono text-[10.5px] text-dim">
          {totalCount} documents · {totalTokens.toLocaleString()} tokens
        </div>
      </div>

      {/* In-context label + meter (d5) */}
      <div className="flex items-center justify-between px-3.5 pb-2 pt-2.5">
        <span className="font-mono text-[10.5px] uppercase tracking-[0.08em] text-muted-foreground">
          In Context · {selectedCount}
        </span>
        <span className={`font-mono text-[10.5px] ${COUNT_TEXT[state]}`}>
          {compactTokens(selectedTokens)} / {compactTokens(ceiling)}
          {state === "warn" && " · near ceiling"}
          {state === "over" && " · over ceiling"}
        </span>
      </div>
      <div className="px-3.5 pb-2.5">
        <div
          role="progressbar"
          aria-valuenow={Math.round(meterPct)}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="Tokens in context"
          className="h-[3px] overflow-hidden rounded-[2px] bg-panel-hi"
        >
          <div className={`h-full ${METER_BG[state]}`} style={{ width: `${meterPct}%` }} />
        </div>
      </div>

      {/* Scrollable list or empty state (d9) */}
      <div className="flex-1 overflow-y-auto px-2 pb-3.5">
        {documents.length === 0 ? (
          <EmptyState
            icon="doc"
            heading="No documents yet"
            hint="Upload a PDF or DOCX to start your workspace."
            action={{
              label: uploading ? "Uploading…" : "Upload",
              icon: "upload",
              onClick: () => inputRef.current?.click(),
              disabled: uploading,
            }}
          />
        ) : (
          documents.map((d) => (
            <DocRow key={d.id} doc={d} selected={selectedIds.includes(d.id)} onToggle={() => toggle(d.id)} />
          ))
        )}
      </div>
    </div>
  );
}
