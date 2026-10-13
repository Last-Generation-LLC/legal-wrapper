"use client";

import { useRef, useState } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { TopBar } from "@/components/layout/top-bar";
import { Btn } from "@/components/ui/btn";
import { Pill } from "@/components/ui/pill";
import { useDocs } from "@/components/documents/docs-context";
import { useUpload } from "@/components/documents/use-upload";
import { ceilingState, overCeilingMessage } from "@/lib/context-ceiling";
import { cacheHitRate, formatCachePct, formatUsageCost } from "@/lib/pricing";
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
import { SessionPanel, type SessionAction } from "./session-panel";
import type { ActiveThread } from "@/lib/chat-store";

// The Assistant screen below the sidebar: TopBar, context strip, thread,
// composer. This is the single stateful entry — children are presentational.
//
// The chat history PERSISTS (#22): the server seeds `initialMessages` from
// the active ChatSession, and the chat route writes every turn back. "New
// session" archives the thread server-side; the Sessions panel manages the archive.
export function AssistantChat({
  modelLabel,
  modelId,
  initialMessages,
  initialSessionId,
}: {
  initialSessionId: string;
  modelLabel: string;
  modelId: string;
  /** The persisted active thread (#22) — seeded into useChat on mount. */
  initialMessages?: AssistantUIMessage[];
}) {
  const { documents, selectedIds, selectedCount, selectedTokens, toggle, select } = useDocs();

  const [sessionId, setSessionId] = useState(initialSessionId);
  const [seedMessages, setSeedMessages] = useState(initialMessages);
  const [showSessions, setShowSessions] = useState(false);
  const [changingSession, setChangingSession] = useState(false);
  const [sessionError, setSessionError] = useState<string | null>(null);
  const [sessionRevision, setSessionRevision] = useState(0);
  const sessionLock = useRef(false);
  const [draft, setDraft] = useState("");
  // When set, the draft edits this user message: sending replaces it and
  // truncates the thread after it (locked decision; native sendMessage behavior).
  const [editingId, setEditingId] = useState<string | null>(null);

  // The transparency panel's template (#11): in-memory, survives "New session"
  // (a setting, not a message), resets on reload. What the panel shows is what
  // the next call sends — except blank, which falls back to the default.
  const [template, setTemplate] = useState(DEFAULT_SYSTEM_PROMPT);
  const [showPrompt, setShowPrompt] = useState(false);

  const { messages, status, error, sendMessage, regenerate, clearError, stop } =
    useChat<AssistantUIMessage>({
      id: sessionId,
      transport: new DefaultChatTransport({ api: "/api/assistant/chat" }),
      // The persisted thread (#22). useChat reads this once on mount —
      // verified against AI SDK v6 docs: `messages` is the seeding option
      // (renamed from v4's initialMessages).
      messages: seedMessages,
    });
  const busy = status === "submitted" || status === "streaming";

  // The edit target can be truncated away before send (review finding): only
  // an id still present in the thread is sent as a replacement — otherwise
  // the draft falls back to a normal append and the editing pill drops.
  const editTarget = resolveEditTarget(messages, editingId);

  // Attach = upload + select, so the new doc is in context for the next send.
  // Upload/parse failures surface as a toast inside the hook (#18).
  const { upload, uploading } = useUpload((doc) => toggle(doc.id));

  // docIds/template ride EVERY call as request-level body (evaluated at send
  // time — hook-level body would go stale when the selection changes).
  const requestBody = () => ({
    sessionId,
    docIds: selectedIds,
    systemPromptTemplate: effectiveTemplate(template, DEFAULT_SYSTEM_PROMPT),
  });

  // #16 guardrail: past the ceiling the call is BLOCKED client-side with a
  // clear message (the route 413s as backstop) — never a silent bad call.
  const blocked =
    ceilingState(selectedTokens) === "over" ? overCeilingMessage(selectedTokens) : null;

  function handleSend() {
    const text = draft.trim();
    if (!text || busy || blocked || sessionLock.current) return;
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
    if (sessionLock.current) return;
    const origin = originatingUserMessage(messages, assistantMessageId);
    if (!origin) return;
    setEditingId(origin.id);
    setDraft(displayText(origin));
  }

  async function handleSessionAction(action: SessionAction): Promise<boolean> {
    if (sessionLock.current || uploading) return false;
    sessionLock.current = true;
    setChangingSession(true);
    setSessionError(null);
    try {
      if (action.action === "new" || action.action === "open" ||
          (action.action === "delete" && action.sessionId === sessionId)) await stop();
      const res = await fetch("/api/assistant/session", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...action, currentSessionId: sessionId, selectedDocIds: selectedIds }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Could not update the session.");
      }
      const { thread }: { thread: ActiveThread | null } = await res.json();
      if (thread) {
        // A new useChat instance per session isolates late chunks from the old stream.
        setSeedMessages(thread.messages);
        setSessionId(thread.sessionId);
        select(thread.selectedDocIds);
        clearError();
        setDraft("");
        setEditingId(null);
      }
      setSessionRevision((n) => n + 1);
      return true;
    } catch (err) {
      setSessionError(err instanceof Error ? err.message : "Could not update the session. Try again.");
      return false;
    } finally {
      sessionLock.current = false;
      setChangingSession(false);
    }
  }

  const selectedDocs = documents.filter((d) => selectedIds.includes(d.id));

  // The most recent assistant turn that reported usage drives the strip's
  // "per-msg" estimate. Hidden until at least one answer has finished.
  const lastUsage = messages.findLast(
    (m) => m.role === "assistant" && m.metadata?.usage,
  )?.metadata?.usage;
  const stripCost = lastUsage ? formatUsageCost(lastUsage, modelId) : undefined;
  // Only surface a cache figure once there's an ACTUAL hit: turn 1 merely writes
  // the cache (0% hit), and "cache hit · 0%" reads as a contradiction. Tie it to a
  // known cost so the strip never shows a lone cache pill (unpriced model).
  const hitRate = lastUsage ? cacheHitRate(lastUsage) : 0;
  const stripCacheHit =
    stripCost !== undefined && hitRate > 0 ? formatCachePct(hitRate) : undefined;

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
            <Btn variant="ghost" size="sm" aria-expanded={showSessions} aria-controls="assistant-sessions" onClick={() => setShowSessions((s) => !s)}>
              Sessions
            </Btn>
            <div className="mx-1 h-[18px] w-px bg-border" />
            <Btn variant="ghost" size="sm" icon="plus" disabled={changingSession || uploading} title="Archives this chat, stops an unfinished answer, and clears your draft." onClick={() => void handleSessionAction({ action: "new" })}>
              New session
            </Btn>
          </div>
        }
      />
      {sessionError && <p role="alert" className="px-4 py-2 text-xs text-red">{sessionError}</p>}
      {showSessions && <SessionPanel currentId={sessionId} busy={changingSession || uploading} revision={sessionRevision} onAction={handleSessionAction} />}
      <ContextStrip docs={selectedDocs} cost={stripCost} cacheHit={stripCacheHit} />
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
        actionsDisabled={changingSession}
        error={error}
        documents={documents}
        onRegenerate={(messageId) => {
          // #16: regenerate rides the same ceiling gate as send — without it
          // the server 413 surfaces as a raw JSON blob (review finding); the
          // composer's red alert already explains why nothing happens.
          if (blocked || sessionLock.current) return;
          void regenerate({ messageId, body: requestBody() });
        }}
        onEditPrompt={handleEditPrompt}
        onRetry={() => {
          if (blocked || sessionLock.current) return;
          clearError();
          void regenerate({ body: requestBody() });
        }}
      />
      <Composer
        value={draft}
        onChange={setDraft}
        onSend={handleSend}
        onAttach={(file) => { if (!sessionLock.current) void upload(file); }}
        onCancelEdit={() => {
          setEditingId(null);
          setDraft("");
        }}
        busy={busy}
        disabled={changingSession}
        blocked={blocked}
        uploading={uploading}
        docCount={selectedCount}
        editing={editTarget !== null}
      />
    </>
  );
}
