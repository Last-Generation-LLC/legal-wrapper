import { useRef } from "react";
import { Btn } from "@/components/ui/btn";
import { Pill } from "@/components/ui/pill";

// Handoff: panel box with a borderless textarea; footer row = Attach + divider
// + mono hint left, Send right. Fully controlled — the parent owns the draft
// so "Edit prompt" can load a previous message into it.
export function Composer({
  value,
  onChange,
  onSend,
  onAttach,
  onCancelEdit,
  busy,
  blocked,
  uploading,
  docCount,
  editing,
}: {
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
  onAttach: (file: File) => void;
  onCancelEdit: () => void;
  /** True while a chat call is in flight — sending is disabled, typing is not. */
  busy: boolean;
  /** Ceiling-block message (#16): sending is disabled and the reason shown. */
  blocked: string | null;
  uploading: boolean;
  docCount: number;
  /** True when the draft is an edit of an earlier message (Esc cancels). */
  editing: boolean;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const canSend = !busy && !blocked && value.trim().length > 0;

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      if (canSend) onSend();
    } else if (e.key === "Escape" && editing) {
      e.preventDefault();
      onCancelEdit();
    }
  }

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // reset so the same file can be re-picked later
    if (file) onAttach(file);
  }

  return (
    <div className="border-t border-border-soft px-8 pb-5 pt-3">
      <div className="mx-auto max-w-[780px]">
        {blocked && (
          <div role="alert" className="mb-2 font-mono text-[10.5px] text-red">
            {blocked}
          </div>
        )}
        <div className="rounded-[4px] border border-border bg-panel px-3.5 py-3">
          <textarea
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Ask a legal question, or about the selected documents…"
            rows={2}
            className="max-h-[180px] min-h-[52px] w-full resize-none bg-transparent text-[13.5px] leading-[1.5] text-foreground outline-none placeholder:text-dim"
          />
          <div className="mt-1.5 flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <Btn
                variant="ghost"
                size="sm"
                icon="doc"
                disabled={uploading}
                onClick={() => fileRef.current?.click()}
              >
                {uploading ? "Uploading…" : "Attach"}
              </Btn>
              <input
                ref={fileRef}
                data-testid="attach-input"
                type="file"
                accept=".pdf,.docx"
                className="hidden"
                onChange={onFile}
              />
              <div className="h-3.5 w-px bg-border" />
              <span className="font-mono text-[10.5px] text-dim">
                ⌘↵ to send · {docCount} docs attached
              </span>
              {editing && <Pill tone="active">editing — Esc cancels</Pill>}
            </div>
            <Btn variant="primary" size="sm" icon="send" disabled={!canSend} onClick={onSend}>
              Send
            </Btn>
          </div>
        </div>
      </div>
    </div>
  );
}
