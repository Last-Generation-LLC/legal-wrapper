import { useState } from "react";
import { Btn } from "@/components/ui/btn";
import { Pill } from "@/components/ui/pill";
import { estimateTokens } from "@/lib/chat-ui";
import { DOCUMENTS_TOKEN, templateHasDocumentsToken } from "@/lib/wrapper";

// The transparency panel (handoff "System prompt panel"): the ACTUAL editable
// template the next message sends, with live size accounting, Reset/Copy, and
// honest notes about the two server-side behaviors the user can't see in the
// textarea — token replacement, and the append fallback when the token is
// deleted. Fully controlled; assistant-chat owns the template state.
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
    void navigator.clipboard.writeText(value).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
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
