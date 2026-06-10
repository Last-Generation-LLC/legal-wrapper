"use client";

import { createContext, useContext, useMemo, useState } from "react";
import type { DocumentMeta } from "@/lib/documents";

// No-RAG context budget: the whole selected doc set is sent on every call, so
// ~180k tokens is the practical ceiling. Ceiling *enforcement* (warn/block) is #16.
const CONTEXT_CEILING = 180_000;

type DocsContextValue = {
  documents: DocumentMeta[];
  selectedIds: string[];
  toggle: (id: string) => void;
  selectedCount: number;
  selectedTokens: number;
  totalCount: number;
  totalTokens: number;
  ceiling: number;
};

const DocsContext = createContext<DocsContextValue | null>(null);

export function DocsProvider({
  documents,
  children,
}: {
  documents: DocumentMeta[];
  children: React.ReactNode;
}) {
  // Selection is in-memory only (d6): it resets on reload and is intentionally
  // NOT persisted. `documents` comes from the server via props, so a post-upload
  // router.refresh() updates the list while this selection survives.
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const value = useMemo<DocsContextValue>(() => {
    const toggle = (id: string) =>
      setSelectedIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]));
    const selected = documents.filter((d) => selectedIds.includes(d.id));
    return {
      documents,
      selectedIds,
      toggle,
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
