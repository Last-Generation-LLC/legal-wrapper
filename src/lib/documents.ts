import { prisma } from "@/lib/prisma";

// Metadata-only view of a Document — the shape the sidebar needs. Mirrors the
// fields `/api/upload` returns; deliberately excludes the heavy extractedText.
export type DocumentMeta = {
  id: string;
  filename: string;
  title: string | null;
  mimeType: string;
  tokenCount: number;
  tokenCountEstimated: boolean;
  createdAt: Date;
};

// Read the full document list for the sidebar. Server-only (touches Prisma);
// called from the Assistant layout Server Component and re-run by router.refresh().
export async function listDocuments(): Promise<DocumentMeta[]> {
  return prisma.document.findMany({
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      filename: true,
      title: true,
      mimeType: true,
      tokenCount: true,
      tokenCountEstimated: true,
      createdAt: true,
    },
  });
}
