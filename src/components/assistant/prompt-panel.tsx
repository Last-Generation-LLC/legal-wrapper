import { useState } from "react";
import { Btn } from "@/components/ui/btn";
import { Pill } from "@/components/ui/pill";
import { estimateTokens } from "@/lib/chat-ui";
import { assistantPromptStrategy } from "@/lib/contract";
import { DOCUMENTS_TOKEN, templateHasDocumentsToken } from "@/lib/wrapper";

// The transparency panel (handoff "System prompt panel"): BOTH pieces of the
// real system prompt — the editable template, and the fixed citation-strategy
// block the server appends after it (read-only here, so an edit can't break
// the footer protocol the route parses). Rendering both is what makes the
// "nothing is hidden from you" note true (review finding). Live size
// accounting, Reset/Copy, and honest notes about the two server-side
// behaviors the textarea can't show — token replacement, and the append
// fallback when the token is deleted. assistant-chat owns the template state.
export function PromptPanel({
  value,
  onChange,
  onReset,
}: {
  value: string;
  onChange: (value: string) => void;
  onReset: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const blank = value.trim().length === 0;

  function onCopy() {
    navigator.clipboard
      .writeText(value)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      })
      .catch(() => {}); // clipboard denied (permissions/insecure context) — no feedback beats a crash
  }

  return (
    <div className="border-b border-border-soft bg-panel px-5 pb-3.5 pt-3">
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="font-mono text-[10.5px] uppercase tracking-[0.06em] text-amber">
            System prompt · editable
          </span>
          <Pill>
            {value.length.toLocaleString()} chars · ~{estimateTokens(value).toLocaleString()} tok
          </Pill>
        </div>
        <div className="flex gap-1.5">
          <Btn variant="ghost" size="sm" icon="refresh" onClick={onReset}>
            Reset
          </Btn>
          <Btn variant="ghost" size="sm" icon="copy" onClick={onCopy}>
            {copied ? "Copied" : "Copy"}
          </Btn>
        </div>
      </div>

      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label="System prompt template"
        className="min-h-[160px] w-full resize-y rounded-[3px] border border-border bg-bg p-3 font-mono text-[11.5px] leading-[1.55] text-foreground outline-none focus:border-amber"
      />

      {/* The fixed appendix — shown so the panel's honesty claim is true. */}
      <div className="mt-2.5">
        <div className="mb-1 font-mono text-[10px] uppercase tracking-[0.06em] text-dim">
          Appended after your template on every call · fixed, so edits can&apos;t break citation
          parsing
        </div>
        <pre className="max-h-[120px] overflow-y-auto whitespace-pre-wrap rounded-[3px] border border-border-soft bg-bg p-3 font-mono text-[10.5px] leading-[1.55] text-muted-foreground">
          {assistantPromptStrategy()}
        </pre>
      </div>

      <div className="mt-1.5 font-mono text-[10.5px] text-dim">
        {DOCUMENTS_TOKEN} is replaced with the full text of selected docs on each call · nothing
        is hidden from you
      </div>
      {/* Honest-behavior notes — these mirror what the server actually does. */}
      {blank ? (
        <div role="alert" className="mt-1 font-mono text-[10.5px] text-amber">
          Blank template — the shipped default prompt will be sent instead.
        </div>
      ) : (
        !templateHasDocumentsToken(value) && (
          <div role="alert" className="mt-1 font-mono text-[10.5px] text-amber">
            {DOCUMENTS_TOKEN} was removed — the documents block will be appended at the end of
            this prompt instead.
          </div>
        )
      )}
    </div>
  );
}
