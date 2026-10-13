import { useEffect, useRef } from "react";
import type { ChatStatus } from "ai";
import { Btn } from "@/components/ui/btn";
import { EmptyState } from "@/components/ui/empty-state";
import type { DocumentMeta } from "@/lib/documents";
import { estimateTokens, type AssistantUIMessage } from "@/lib/chat-ui";
import { ChatMessage } from "./chat-message";

/** Raw streamed text length of the trailing assistant message (footer included — it's an estimate). */
function trailingAssistantText(messages: AssistantUIMessage[]): string {
  const last = messages[messages.length - 1];
  if (!last || last.role !== "assistant") return "";
  return last.parts
    .filter((p) => p.type === "text")
    .map((p) => p.text)
    .join("");
}

export function MessageThread({
  messages,
  status,
  error,
  documents,
  onRegenerate,
  onEditPrompt,
  onRetry,
  actionsDisabled = false,
}: {
  messages: AssistantUIMessage[];
  status: ChatStatus;
  actionsDisabled?: boolean;
  error: Error | undefined;
  documents: DocumentMeta[];
  onRegenerate: (messageId: string) => void;
  onEditPrompt: (messageId: string) => void;
  onRetry: () => void;
}) {
  const busy = status === "submitted" || status === "streaming";
  const streamedText = busy ? trailingAssistantText(messages) : "";
  const streamedTokens = estimateTokens(streamedText);

  // Stick to the bottom while messages grow — but only if the user is already
  // near it, so scrolling up to re-read during a stream isn't hijacked.
  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
    if (nearBottom) el.scrollTop = el.scrollHeight;
  }, [messages.length, streamedText.length, status]);

  return (
    <div ref={scrollRef} className="flex-1 overflow-y-auto py-6">
      <div className="mx-auto max-w-[780px] px-8">
        {messages.length === 0 && !busy ? (
          <EmptyState
            icon="chat"
            heading="Ask a legal question"
            hint="Ask anything in law, or select documents in the sidebar to ground answers in them."
          />
        ) : (
          messages.map((m) => (
            <ChatMessage
              key={m.id}
              message={m}
              documents={documents}
              busy={busy || actionsDisabled}
              onRegenerate={() => onRegenerate(m.id)}
              onEditPrompt={() => onEditPrompt(m.id)}
            />
          ))
        )}

        {/* Streaming indicator — pulsing amber dot + live token estimate */}
        {busy && (
          <div className="mt-2 flex gap-3.5">
            <div className="w-7 shrink-0 pt-0.5 font-mono text-[9.5px] font-medium uppercase tracking-[0.1em] text-amber">
              LL
            </div>
            <div className="flex items-center gap-2 pt-0.5 text-muted-foreground">
              <span className="inline-block size-[7px] animate-pulse rounded-full bg-amber" />
              <span className="font-mono text-[11px]">
                {streamedTokens > 0
                  ? `drafting · ~${streamedTokens} tok generated`
                  : "drafting…"}
              </span>
            </div>
          </div>
        )}

        {/* Stream/transport errors — inline (toasts are #18) */}
        {status === "error" && error && (
          <div role="alert" className="mt-2 flex items-center gap-3 pl-[42px]">
            <span className="font-mono text-[10.5px] text-red">{error.message}</span>
            <Btn variant="ghost" size="sm" icon="refresh" disabled={actionsDisabled} onClick={onRetry}>
              Retry
            </Btn>
          </div>
        )}
      </div>
    </div>
  );
}
