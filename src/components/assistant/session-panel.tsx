"use client";

import { useEffect, useState } from "react";
import { Btn } from "@/components/ui/btn";

export type SessionSummary = {
  id: string;
  title: string | null;
  createdAt: string;
  archivedAt: string | null;
  _count: { messages: number };
};
export type SessionAction =
  | { action: "new" }
  | { action: "open" | "delete"; sessionId: string }
  | { action: "rename"; sessionId: string; title: string };

export function SessionPanel({ currentId, busy, revision, onAction }: {
  currentId: string;
  busy: boolean;
  revision: number;
  onAction: (action: SessionAction) => Promise<boolean>;
}) {
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refresh, setRefresh] = useState(0);
  const [editing, setEditing] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [deleting, setDeleting] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch("/api/assistant/session", { signal: controller.signal });
        if (!res.ok) throw new Error("Could not load sessions.");
        const data: SessionSummary[] = await res.json();
        if (!controller.signal.aborted) setSessions(data);
      } catch {
        if (!controller.signal.aborted) setError("Could not load sessions. Try again.");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }
    void load();
    return () => controller.abort();
  }, [revision, refresh]);

  async function act(action: SessionAction) {
    if (await onAction(action)) {
      setEditing(null);
      setDeleting(null);
    }
  }

  return (
    <section id="assistant-sessions" aria-label="Sessions" className="shrink-0 border-b border-border bg-panel px-4 py-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-medium">Sessions</h2>
        <Btn size="sm" variant="ghost" disabled={busy || loading} onClick={() => setRefresh((n) => n + 1)}>Refresh list</Btn>
      </div>
      <p className="my-2 text-xs text-muted-foreground">Opening or starting a session discards your unsent draft and stops any unfinished answer. Completed messages stay saved.</p>
      {loading && <p role="status" className="text-xs">Loading sessions…</p>}
      {error && <p role="alert" className="text-xs text-red">{error}</p>}
      {!loading && !error && sessions.length === 0 && <p className="text-xs text-dim">No saved sessions yet.</p>}
      <ul className="max-h-64 overflow-y-auto">
        {sessions.map((session) => {
          const label = session.title || `Untitled · ${new Date(session.createdAt).toLocaleString()} · ${session.id.slice(-6)}`;
          return (
            <li key={session.id} className="border-t border-border-soft py-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className="min-w-0 flex-1 break-words text-sm">{label}</span>
                <span className="text-xs text-dim">{session.id === currentId ? "Current" : "Archived"} · {session._count.messages} messages</span>
                <Btn size="sm" disabled={busy || session.id === currentId} onClick={() => void act({ action: "open", sessionId: session.id })} aria-label={`Open ${label}`}>Open</Btn>
                <Btn size="sm" variant="ghost" disabled={busy} onClick={() => { setEditing(session.id); setTitle(session.title ?? ""); setDeleting(null); }} aria-label={`Rename ${label}`}>Rename</Btn>
                <Btn size="sm" variant="ghost" disabled={busy} onClick={() => { setDeleting(session.id); setEditing(null); }} aria-label={`Delete ${label}`}>Delete</Btn>
              </div>
              <time dateTime={session.createdAt} className="text-xs text-dim">Created {new Date(session.createdAt).toLocaleString()}</time>
              {editing === session.id && (
                <form className="mt-2 flex flex-wrap gap-2" onSubmit={(e) => { e.preventDefault(); if (title.trim() && !busy) void act({ action: "rename", sessionId: session.id, title }); }}>
                  <input autoFocus aria-label="Session name" maxLength={120} value={title} disabled={busy} onChange={(e) => setTitle(e.target.value)} onKeyDown={(e) => { if (e.key === "Escape") setEditing(null); }} className="min-w-0 flex-1 rounded-[3px] border border-border bg-bg px-2 text-sm" />
                  <Btn size="sm" type="submit" disabled={busy || !title.trim()}>Save name</Btn>
                  <Btn size="sm" type="button" disabled={busy} onClick={() => setEditing(null)}>Cancel</Btn>
                </form>
              )}
              {deleting === session.id && (
                <div className="mt-2 text-xs">
                  <p>Delete “{label}” and all its messages? This cannot be undone.{session.id === currentId && " Any unfinished answer will stop and a new empty session will open."}</p>
                  <div className="mt-2 flex gap-2">
                    <Btn size="sm" disabled={busy} onClick={() => void act({ action: "delete", sessionId: session.id })}>Delete permanently</Btn>
                    <Btn size="sm" disabled={busy} onClick={() => setDeleting(null)}>Cancel</Btn>
                  </div>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
