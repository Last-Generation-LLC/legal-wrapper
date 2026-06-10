import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Document } from "@prisma/client";

// Mock the Prisma singleton before importing the module under test.
vi.mock("@/lib/prisma", () => ({
  prisma: { document: { findMany: vi.fn() } },
}));

import { prisma } from "@/lib/prisma";
import { listDocuments, type DocumentMeta } from "@/lib/documents";

describe("listDocuments", () => {
  beforeEach(() => vi.clearAllMocks());

  it("selects metadata only, newest first, and never the extracted text", async () => {
    const rows: DocumentMeta[] = [{ id: "d1", filename: "a.pdf", title: null, mimeType: "application/pdf", tokenCount: 100, tokenCountEstimated: false, createdAt: new Date() }];
    // mockResolvedValue expects the full Document model (includes extractedText);
    // cast through unknown since rows is intentionally the metadata-only subset.
    vi.mocked(prisma.document.findMany).mockResolvedValue(rows as unknown as Document[]);

    const result = await listDocuments();

    expect(result).toEqual(rows);
    const arg = vi.mocked(prisma.document.findMany).mock.calls[0][0];
    expect(arg?.orderBy).toEqual({ createdAt: "desc" });
    expect(arg?.select).toMatchObject({
      id: true, filename: true, title: true, mimeType: true,
      tokenCount: true, tokenCountEstimated: true, createdAt: true,
    });
    // The heavy full text must not be pulled into the list query.
    expect((arg?.select as Record<string, boolean>).extractedText).toBeUndefined();
  });
});
