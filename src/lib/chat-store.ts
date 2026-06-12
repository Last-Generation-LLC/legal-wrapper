// Server-side persistence for the Assistant's single auto-saved thread (#22).
//
// One ChatSession is ACTIVE (archivedAt = null) at any time; "New session"
// archives it and starts a fresh one — nothing is deleted (the session-list
// UI, #26, will browse the archive). Each Message row stores the FULL AI SDK
// UIMessage as JSON so citations, confidence, and token usage round-trip
// exactly; the client's message array is the source of truth and is
// replace-all-written before every model call, which inherits the thread's
// edit/truncate/regenerate semantics for free.

import { cache } from "react";
import type { ChatSession } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { AssistantUIMessage } from "@/lib/chat-ui";

/** The active session, created lazily on first use. */
export async function getActiveSession(): Promise<ChatSession> {
  const active = await prisma.chatSession.findFirst({
    where: { archivedAt: null },
    orderBy: { createdAt: "desc" },
  });
  return active ?? prisma.chatSession.create({ data: {} });
}

/**
 * Minimal shape check before trusting a stored row. Rows that fail (schema
 * drift, hand-edited DB) are SKIPPED on load — a corrupt message must never
 * take the whole thread down.
 */
function parseStoredMessage(content: string): AssistantUIMessage | null {
  try {
    const parsed: unknown = JSON.parse(content);
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      typeof (parsed as { id?: unknown }).id === "string" &&
      ["user", "assistant", "system"].includes(
        (parsed as { role?: unknown }).role as string,
      ) &&
      Array.isArray((parsed as { parts?: unknown }).parts)
    ) {
      return parsed as AssistantUIMessage;
    }
    return null;
  } catch {
    return null;
  }
}

export interface ActiveThread {
  sessionId: string;
  messages: AssistantUIMessage[];
  selectedDocIds: string[];
}

/**
 * The active thread as the UI needs it: ordered messages + the doc selection.
 * Wrapped in React cache() — the assistant layout (selection) and page
 * (messages) both call it during one render; only one DB read happens.
 */
export const loadActiveThread = cache(async function loadActiveThread(): Promise<ActiveThread> {
  const session = await getActiveSession();
  const rows = await prisma.message.findMany({
    where: { chatSessionId: session.id },
    orderBy: { position: "asc" },
  });

  let selectedDocIds: string[] = [];
  try {
    const parsed: unknown = JSON.parse(session.selectedDocIds);
    if (Array.isArray(parsed)) {
      selectedDocIds = parsed.filter((id): id is string => typeof id === "string");
    }
  } catch {
    // malformed selection JSON — degrade to no selection
  }

  return {
    sessionId: session.id,
    messages: rows
      .map((row) => parseStoredMessage(row.content))
      .filter((m): m is AssistantUIMessage => m !== null),
    selectedDocIds,
  };
});

/**
 * Replace the session's whole thread with the client's array (the truth) and
 * record the doc selection the turn was sent with. One transaction so a
 * crash can't leave a half-written thread.
 */
export async function replaceThread(
  sessionId: string,
  messages: AssistantUIMessage[],
  selectedDocIds: string[],
): Promise<void> {
  await prisma.$transaction([
    prisma.message.deleteMany({ where: { chatSessionId: sessionId } }),
    prisma.message.createMany({
      data: messages.map((message, position) => ({
        id: message.id,
        chatSessionId: sessionId,
        role: message.role,
        content: JSON.stringify(message),
        position,
      })),
    }),
    prisma.chatSession.update({
      where: { id: sessionId },
      data: { selectedDocIds: JSON.stringify(selectedDocIds) },
    }),
  ]);
}

/** Append one message (the finished assistant turn) after the existing thread. */
export async function appendMessage(
  sessionId: string,
  message: AssistantUIMessage,
  position: number,
): Promise<void> {
  await prisma.message.create({
    data: {
      id: message.id,
      chatSessionId: sessionId,
      role: message.role,
      content: JSON.stringify(message),
      position,
    },
  });
}

/** "New session": archive the active thread (never delete) and start fresh. */
export async function archiveActiveSession(): Promise<ChatSession> {
  const active = await getActiveSession();
  const [, fresh] = await prisma.$transaction([
    prisma.chatSession.update({
      where: { id: active.id },
      data: { archivedAt: new Date() },
    }),
    prisma.chatSession.create({ data: {} }),
  ]);
  return fresh;
}
