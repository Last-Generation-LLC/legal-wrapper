"use client";

import { useState } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { TopBar } from "@/components/layout/top-bar";
import { Btn } from "@/components/ui/btn";
import { Pill } from "@/components/ui/pill";
import { useDocs } from "@/components/documents/docs-context";
import { useUpload } from "@/components/documents/use-upload";
import { DEFAULT_SYSTEM_PROMPT } from "@/lib/wrapper";
import {
  displayText,
  originatingUserMessage,
  resolveEditTarget,
  type AssistantUIMessage,
} from "@/lib/chat-ui";
import { ContextStrip } from "./context-strip";
import { MessageThread } from "./message-thread";
import { Composer } from "./composer";

// The Assistant screen below the sidebar: TopBar, context strip, thread,
// composer. This is the single stateful entry — children are presentational.
//
// The chat history is IN-MEMORY by decision: it resets on reload.
// Persistence to ChatSession/Message is a captured follow-up task (#22).
export function AssistantChat({ modelLabel }: { modelLabel: string }) {
  const { documents, selectedIds, selectedCount, toggle } = useDocs();

  const [draft, setDraft] = useState("");
  // When set, the draft edits this user message: sending replaces it and
  // truncates the thread after it (locked decision; native sendMessage behavior).
  const [editingId, setEditingId] = useState<string | null>(null);

  const { messages, status, error, sendMessage, regenerate, setMessages, clearError, stop } =
    useChat<AssistantUIMessage>({
      transport: new DefaultChatTransport({ api: "/api/assistant/chat" }),
    });
  const busy = status === "submitted" || status === "streaming";

  // The edit target can be truncated away before send (review finding): only
  // an id still present in the thread is sent as a replacement — otherwise
  // the draft falls back to a normal append and the editing pill drops.
  const editTarget = resolveEditTarget(messages, editingId);

  // Attach = upload + select, so the new doc is in context for the next send.
  const { upload, uploading, error: uploadError } = useUpload((doc) => toggle(doc.id));

  // docIds/template ride EVERY call as request-level body (evaluated at send
  // time — hook-level body would go stale when the selection changes). The
  // template is the shipped default until #11 makes it editable.
  const requestBody = () => ({
    docIds: selectedIds,
    systemPromptTemplate: DEFAULT_SYSTEM_PROMPT,
  });

  function handleSend() {
    const text = draft.trim();
    if (!text || busy) return;
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
            <div className="mx-1 h-[18px] w-px bg-border" />
            <Btn variant="ghost" size="sm" icon="plus" onClick={() => void handleNewSession()}>
              New session
            </Btn>
          </div>
        }
      />
      <ContextStrip docs={selectedDocs} />
      <MessageThread
        messages={messages}
        status={status}
        error={error}
        documents={documents}
        onRegenerate={(messageId) => void regenerate({ messageId, body: requestBody() })}
        onEditPrompt={handleEditPrompt}
        onRetry={() => {
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
        uploading={uploading}
        uploadError={uploadError}
        docCount={selectedCount}
        editing={editTarget !== null}
      />
    </>
  );
}
