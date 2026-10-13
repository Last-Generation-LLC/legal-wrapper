"use client";

import { createContext, useContext, useMemo, useState } from "react";
import type { DocumentMeta } from "@/lib/documents";
// No-RAG context budget: the whole selected doc set is sent on every call.
// The shared constant (and the warn/block enforcement, #16) live in
// context-ceiling.ts so the UI and the API routes can never disagree.
import { CONTEXT_CEILING } from "@/lib/context-ceiling";

type DocsContextValue = {
  documents: DocumentMeta[];
  selectedIds: string[];
  toggle: (id: string) => void;
  select: (ids: string[]) => void;
  selectedCount: number;
  selectedTokens: number;
  totalCount: number;
  totalTokens: number;
  ceiling: number;
};

const DocsContext = createContext<DocsContextValue | null>(null);

export function DocsProvider({
  documents,
  initialSelectedIds,
  children,
}: {
  documents: DocumentMeta[];
  /** Seed selection (#22): the active chat session's restored doc selection. */
  initialSelectedIds?: string[];
  children: React.ReactNode;
}) {
  // Selection lives in client state; the SEED comes from the persisted chat
  // session (#22 — restored with the thread, since a conversation about
  // documents is half-meaningless without them). Later toggles are persisted
  // by the chat route whenever a turn is sent. `documents` comes from the
  // server via props, so a post-upload router.refresh() updates the list
  // while this selection survives.
  const [selectedIds, setSelectedIds] = useState<string[]>(initialSelectedIds ?? []);

  const value = useMemo<DocsContextValue>(() => {
    const toggle = (id: string) =>
      setSelectedIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]));
    const selected = documents.filter((d) => selectedIds.includes(d.id));
    return {
      documents,
      selectedIds,
      toggle,
      select: (ids) => setSelectedIds(ids.filter((id) => documents.some((doc) => doc.id === id))),
      selectedCount: selected.length,
      selectedTokens: selected.reduce((sum, d) => sum + d.tokenCount, 0),
      totalCount: documents.length,
      totalTokens: documents.reduce((sum, d) => sum + d.tokenCount, 0),
      ceiling: CONTEXT_CEILING,
    };
  }, [documents, selectedIds]);

  return <DocsContext.Provider value={value}>{children}</DocsContext.Provider>;
}

export function useDocs(): DocsContextValue {
  const ctx = useContext(DocsContext);
  if (!ctx) throw new Error("useDocs must be used within a DocsProvider");
  return ctx;
}
