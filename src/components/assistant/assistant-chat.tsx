"use client";

import { useState } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { TopBar } from "@/components/layout/top-bar";
import { Btn } from "@/components/ui/btn";
import { Pill } from "@/components/ui/pill";
import { useDocs } from "@/components/documents/docs-context";
import { useUpload } from "@/components/documents/use-upload";
import { ceilingState, overCeilingMessage } from "@/lib/context-ceiling";
import { DEFAULT_SYSTEM_PROMPT } from "@/lib/wrapper";
import {
  displayText,
  effectiveTemplate,
  originatingUserMessage,
  resolveEditTarget,
  type AssistantUIMessage,
} from "@/lib/chat-ui";
import { ContextStrip } from "./context-strip";
import { MessageThread } from "./message-thread";
import { Composer } from "./composer";
import { PromptPanel } from "./prompt-panel";

// The Assistant screen below the sidebar: TopBar, context strip, thread,
// composer. This is the single stateful entry — children are presentational.
//
// The chat history is IN-MEMORY by decision: it resets on reload.
// Persistence to ChatSession/Message is a captured follow-up task (#22).
export function AssistantChat({
  modelLabel,
  initialMessages,
}: {
  modelLabel: string;
  /** The persisted active thread (#22) — seeded into useChat on mount. */
  initialMessages?: AssistantUIMessage[];
}) {
  const { documents, selectedIds, selectedCount, selectedTokens, toggle } = useDocs();

  const [draft, setDraft] = useState("");
  // When set, the draft edits this user message: sending replaces it and
  // truncates the thread after it (locked decision; native sendMessage behavior).
  const [editingId, setEditingId] = useState<string | null>(null);

  // The transparency panel's template (#11): in-memory, survives "New session"
  // (a setting, not a message), resets on reload. What the panel shows is what
  // the next call sends — except blank, which falls back to the default.
  const [template, setTemplate] = useState(DEFAULT_SYSTEM_PROMPT);
  const [showPrompt, setShowPrompt] = useState(false);

  const { messages, status, error, sendMessage, regenerate, setMessages, clearError, stop } =
    useChat<AssistantUIMessage>({
      transport: new DefaultChatTransport({ api: "/api/assistant/chat" }),
      // The persisted thread (#22). useChat reads this once on mount —
      // verified against AI SDK v6 docs: `messages` is the seeding option
      // (renamed from v4's initialMessages).
      messages: initialMessages,
    });
  const busy = status === "submitted" || status === "streaming";

  // The edit target can be truncated away before send (review finding): only
  // an id still present in the thread is sent as a replacement — otherwise
  // the draft falls back to a normal append and the editing pill drops.
  const editTarget = resolveEditTarget(messages, editingId);

  // Attach = upload + select, so the new doc is in context for the next send.
  const { upload, uploading, error: uploadError } = useUpload((doc) => toggle(doc.id));

  // docIds/template ride EVERY call as request-level body (evaluated at send
  // time — hook-level body would go stale when the selection changes).
  const requestBody = () => ({
    docIds: selectedIds,
    systemPromptTemplate: effectiveTemplate(template, DEFAULT_SYSTEM_PROMPT),
  });

  // #16 guardrail: past the ceiling the call is BLOCKED client-side with a
  // clear message (the route 413s as backstop) — never a silent bad call.
  const blocked =
    ceilingState(selectedTokens) === "over" ? overCeilingMessage(selectedTokens) : null;

  function handleSend() {
    const text = draft.trim();
    if (!text || busy || blocked) return;
    void sendMessage(
      {
        text,
        metadata: { createdAt: Date.now() },
        ...(editTarget ? { messageId: editTarget } : {}),
      },
      { body: requestBody() },
    );
    setDraft("");
    setEditingId(null);
  }

  function handleEditPrompt(assistantMessageId: string) {
    const origin = originatingUserMessage(messages, assistantMessageId);
    if (!origin) return;
    setEditingId(origin.id);
    setDraft(displayText(origin));
  }

  async function handleNewSession() {
    // Abort any in-flight stream FIRST (review finding): without stop(), the
    // active response's chunks re-push the streaming assistant message into
    // the just-cleared thread — and the Opus call keeps running.
    await stop();
    // #22: archive the persisted thread server-side (never deleted — the
    // session-list UI, #26, will browse the archive) before clearing the
    // client. If the call fails, keep the thread: clearing the screen while
    // the server still considers the old session active would make the next
    // send silently resurrect it.
    try {
      const res = await fetch("/api/assistant/session", { method: "POST" });
      if (!res.ok) return;
    } catch {
      return;
    }
    setMessages([]);
    clearError();
    setDraft("");
    setEditingId(null);
  }

  const selectedDocs = documents.filter((d) => selectedIds.includes(d.id));

  return (
    <>
      <TopBar
        crumbs={["~/workspaces", "Assistant"]}
        right={
          <div className="flex items-center gap-2">
            <Pill tone="active">● {modelLabel}</Pill>
            <Btn variant="ghost" size="sm" icon="eye" onClick={() => setShowPrompt((s) => !s)}>
              {showPrompt ? "Hide" : "Show"} prompt
            </Btn>
            <div className="mx-1 h-[18px] w-px bg-border" />
            <Btn variant="ghost" size="sm" icon="plus" onClick={() => void handleNewSession()}>
              New session
            </Btn>
          </div>
        }
      />
      <ContextStrip docs={selectedDocs} />
      {showPrompt && (
        <PromptPanel
          value={template}
          onChange={setTemplate}
          onReset={() => setTemplate(DEFAULT_SYSTEM_PROMPT)}
        />
      )}
      <MessageThread
        messages={messages}
        status={status}
        error={error}
        documents={documents}
        onRegenerate={(messageId) => {
          // #16: regenerate rides the same ceiling gate as send — without it
          // the server 413 surfaces as a raw JSON blob (review finding); the
          // composer's red alert already explains why nothing happens.
          if (blocked) return;
          void regenerate({ messageId, body: requestBody() });
        }}
        onEditPrompt={handleEditPrompt}
        onRetry={() => {
          if (blocked) return;
          clearError();
          void regenerate({ body: requestBody() });
        }}
      />
      <Composer
        value={draft}
        onChange={setDraft}
        onSend={handleSend}
        onAttach={(file) => void upload(file)}
        onCancelEdit={() => {
          setEditingId(null);
          setDraft("");
        }}
        busy={busy}
        blocked={blocked}
        uploading={uploading}
        uploadError={uploadError}
        docCount={selectedCount}
        editing={editTarget !== null}
      />
    </>
  );
}
