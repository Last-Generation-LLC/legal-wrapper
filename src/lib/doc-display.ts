import { PDF_MIME, DOCX_MIME } from "@/lib/extract";

// Short uppercase format badge derived from the stored MIME type. We have no
// doc-type taxonomy (MSA/DPA/…) in the schema, so format is the honest label.
export function docFormat(mimeType: string): string {
  if (mimeType === PDF_MIME) return "PDF";
  if (mimeType === DOCX_MIME) return "DOCX";
  return "FILE";
}

// "31.4k tok", or "~31.4k tok" when the count is a char-based estimate (the
// live Anthropic count failed at upload time — see Document.tokenCountEstimated).
export function formatTokens(tokenCount: number, estimated: boolean): string {
  return `${estimated ? "~" : ""}${(tokenCount / 1000).toFixed(1)}k tok`;
}

// Friendly display name: the optional title, else the original filename.
export function docLabel(doc: { title: string | null; filename: string }): string {
  return doc.title ?? doc.filename;
}
