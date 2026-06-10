import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

// Select literal for the metadata-only view of a Document — the shape the
// sidebar needs. Mirrors the fields `/api/upload` returns; deliberately
// excludes the heavy extractedText.
//
// Typed with `satisfies Prisma.DocumentSelect` so any schema change to a
// selected field fails at compile time here rather than silently diverging.
const documentMetaSelect = {
  id: true,
  filename: true,
  title: true,
  mimeType: true,
  tokenCount: true,
  tokenCountEstimated: true,
  createdAt: true,
} satisfies Prisma.DocumentSelect;

// Derived from the select literal above — stays in sync with the schema
// automatically. Shape: 7 fields; title is string | null, createdAt is Date.
export type DocumentMeta = Prisma.DocumentGetPayload<{
  select: typeof documentMetaSelect;
}>;

// Read the full document list for the sidebar. Server-only (touches Prisma);
// called from the Assistant layout Server Component and re-run by router.refresh().
export async function listDocuments(): Promise<DocumentMeta[]> {
  return prisma.document.findMany({
    orderBy: { createdAt: "desc" },
    select: documentMetaSelect,
  });
}
