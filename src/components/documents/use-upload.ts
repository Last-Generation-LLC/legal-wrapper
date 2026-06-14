"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import type { Document } from "@prisma/client";

/**
 * Shared upload flow for every surface with an upload affordance (the sidebar's
 * Upload button, the composer's Attach button). One file per POST (d7); upload
 * and parse failures surface as an error toast (#18 — both come back from
 * /api/upload, and an inline banner under a button that lives in two places was
 * redundant). On success the server list is re-fetched via router.refresh()
 * (d2) after `onUploaded` runs, so a caller can e.g. select the new document
 * before the list re-renders.
 */
export function useUpload(onUploaded?: (doc: Document) => void) {
  const router = useRouter();
  const [uploading, setUploading] = useState(false);

  async function upload(file: File) {
    setUploading(true);
    try {
      const body = new FormData();
      body.append("file", file);
      const res = await fetch("/api/upload", { method: "POST", body });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        toast.error(data?.error ?? `Upload failed (${res.status}).`);
        return;
      }
      onUploaded?.((await res.json()) as Document);
      router.refresh();
    } catch {
      toast.error("Upload failed — check your connection and try again.");
    } finally {
      setUploading(false);
    }
  }

  return { upload, uploading };
}
