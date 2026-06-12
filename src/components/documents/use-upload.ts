"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Document } from "@prisma/client";

/**
 * Shared upload flow for every surface with an upload affordance (the sidebar's
 * Upload button, the composer's Attach button). One file per POST (d7); route
 * errors surface inline via `error` (d8); on success the server list is
 * re-fetched via router.refresh() (d2) after `onUploaded` runs, so a caller
 * can e.g. select the new document before the list re-renders.
 */
export function useUpload(onUploaded?: (doc: Document) => void) {
  const router = useRouter();
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function upload(file: File) {
    setUploading(true);
    setError(null);
    try {
      const body = new FormData();
      body.append("file", file);
      const res = await fetch("/api/upload", { method: "POST", body });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setError(data?.error ?? `Upload failed (${res.status}).`);
        return;
      }
      onUploaded?.((await res.json()) as Document);
      router.refresh();
    } catch {
      setError("Upload failed — check your connection and try again.");
    } finally {
      setUploading(false);
    }
  }

  return { upload, uploading, error };
}
