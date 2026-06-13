import * as React from "react";
import { useState } from "react";
import { Btn } from "@/components/ui/btn";
import { ConfidenceDot } from "@/components/ui/confidence-dot";
import { Icon } from "@/components/ui/icon";
import { Pill } from "@/components/ui/pill";
import { citationLabel } from "@/lib/doc-display";
import type { DocumentMeta } from "@/lib/documents";
import {
  displayText,
  formatClock,
  verifiedAnswerOf,
  type AssistantUIMessage,
} from "@/lib/chat-ui";

// Handoff renderRich: **bold** spans become <strong>; everything else is
// pre-wrapped plain text. Deliberately not a markdown renderer — the system
// prompt asks for prose + bold only.
function richText(text: string): React.ReactNode {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
    part.startsWith("**") && part.endsWith("**") ? (
      <strong key={i} className="font-semibold text-foreground">
        {part.slice(2, -2)}
      </strong>
    ) : (
      <React.Fragment key={i}>{part}</React.Fragment>
    ),
  );
}

export function ChatMessage({
  message,
  documents,
  busy,
  onRegenerate,
  onEditPrompt,
}: {
  message: AssistantUIMessage;
  documents: DocumentMeta[];
  /** True while any call is in flight — regenerate/edit are disabled to avoid racing the stream. */
  busy: boolean;
  onRegenerate: () => void;
  onEditPrompt: () => void;
}) {
  const isUser = message.role === "user";
  const text = displayText(message);
  const answer = isUser ? null : verifiedAnswerOf(message);
  const meta = message.metadata;
  const [copied, setCopied] = useState(false);

  function onCopy() {
    navigator.clipboard
      .writeText(text)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      })
      .catch(() => {}); // clipboard denied — no feedback beats a crash
  }

  return (
    <div className="mb-7 flex gap-3.5">
      {/* Role tag — 28px column, mono uppercase; You = dim, LL = amber */}
      <div
        className={
          "w-7 shrink-0 pt-0.5 font-mono text-[9.5px] font-medium uppercase tracking-[0.1em] " +
          (isUser ? "text-dim" : "text-amber")
        }
      >
        {isUser ? "You" : "LL"}
      </div>

      <div className="min-w-0 flex-1">
        {/* Metadata line: timestamp · token accounting · confidence */}
        <div className="mb-1.5 flex items-baseline gap-2.5 font-mono text-[10.5px] text-dim">
          {meta?.createdAt != null && <span>{formatClock(meta.createdAt)}</span>}
          {meta?.inputTokens != null && meta?.outputTokens != null && (
            <span>
              in {meta.inputTokens.toLocaleString()} · out {meta.outputTokens.toLocaleString()} · cached{" "}
              {(meta.cachedInputTokens ?? 0).toLocaleString()}
            </span>
          )}
          {answer && (
            <span className="inline-flex items-center gap-1.5">
              <ConfidenceDot confidence={answer.confidence} />
              {answer.confidence.toFixed(2)}
            </span>
          )}
        </div>

        {/* Body — 13.5px / 1.6; user turns are muted, assistant turns full strength */}
        <div
          className={
            "whitespace-pre-wrap text-[13.5px] leading-[1.6] " +
            (isUser ? "text-muted-foreground" : "text-foreground")
          }
        >
          {richText(text)}
        </div>

        {/* Citation pills — ctx (blue) when verified, warn (amber) when not */}
        {answer && answer.citations.length > 0 && (
          <div className="mt-2.5 flex flex-wrap gap-1.5">
            {answer.citations.map((c, i) => (
              <Pill key={i} tone={c.verified ? "ctx" : "warn"} className="py-[3px]">
                <Icon name="doc" size={10} />
                {citationLabel(c, documents)}
              </Pill>
            ))}
          </div>
        )}

        {/* Actions — assistant turns only */}
        {!isUser && (
          <div className="mt-2.5 flex gap-1">
            <Btn variant="ghost" size="sm" icon="copy" onClick={onCopy}>
              {copied ? "Copied" : "Copy"}
            </Btn>
            <Btn variant="ghost" size="sm" icon="refresh" disabled={busy} onClick={onRegenerate}>
              Regenerate
            </Btn>
            <Btn variant="ghost" size="sm" icon="edit" disabled={busy} onClick={onEditPrompt}>
              Edit prompt
            </Btn>
          </div>
        )}
      </div>
    </div>
  );
}
