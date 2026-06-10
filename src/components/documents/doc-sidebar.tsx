"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Btn } from "@/components/ui/btn";
import { useDocs } from "./docs-context";
import { DocRow } from "./doc-row";

export function DocSidebar() {
  const {
    documents, selectedIds, toggle,
    selectedCount, selectedTokens, totalCount, totalTokens, ceiling,
  } = useDocs();
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // d5: fill fraction, clamped at 100%. No warn/block here — that's #16.
  const meterPct = Math.min(100, (selectedTokens / ceiling) * 100);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // reset so the same file can be re-picked later
    if (!file) return;

    setUploading(true);
    setError(null);
    try {
      const body = new FormData();
      body.append("file", file); // d7: single file per POST
      const res = await fetch("/api/upload", { method: "POST", body });
      if (!res.ok) {
        // d8: surface the route's 400/413/422 { error } inline, never silently.
        const data = await res.json().catch(() => null);
        setError(data?.error ?? `Upload failed (${res.status}).`);
        return;
      }
      router.refresh(); // d2: re-run the server fetch so the new doc appears
    } catch {
      setError("Upload failed — check your connection and try again.");
    } finally {
      setUploading(false);
    }
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

      {error && (
        <div role="alert" className="border-b border-border-soft bg-panel px-3.5 py-2 font-mono text-[10.5px] text-red">
          {error}
        </div>
      )}

      {/* In-context label + meter (d5) */}
      <div className="flex items-center justify-between px-3.5 pb-2 pt-2.5">
        <span className="font-mono text-[10.5px] uppercase tracking-[0.08em] text-muted-foreground">
          In Context · {selectedCount}
        </span>
        <span className="font-mono text-[10.5px] text-dim">
          {(selectedTokens / 1000).toFixed(1)}k / {(ceiling / 1000).toFixed(0)}k
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
          <div className="h-full bg-amber" style={{ width: `${meterPct}%` }} />
        </div>
      </div>

      {/* Scrollable list or empty state (d9) */}
      <div className="flex-1 overflow-y-auto px-2 pb-3.5">
        {documents.length === 0 ? (
          <div className="px-2 py-8 text-center font-mono text-[10.5px] leading-relaxed text-dim">
            No documents yet. Upload a PDF or DOCX to begin.
          </div>
        ) : (
          documents.map((d) => (
            <DocRow key={d.id} doc={d} selected={selectedIds.includes(d.id)} onToggle={() => toggle(d.id)} />
          ))
        )}
      </div>
    </div>
  );
}
