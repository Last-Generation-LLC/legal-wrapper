import { PDF_MIME, DOCX_MIME } from "@/lib/extract";
import type { VerifiedCitation } from "@/lib/contract";

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

// Handoff: citation pills carry the doc name without its file extension.
export function citationDocName(
  citation: Pick<VerifiedCitation, "docId">,
  documents: Array<{ id: string; title: string | null; filename: string }>,
): string {
  const doc = documents.find((d) => d.id === citation.docId);
  if (!doc) return citation.docId;
  return docLabel(doc).replace(/\.(pdf|docx)$/i, "");
}

// "acme-nda §14.1 · p.6", with a "· unverified" suffix when the quote failed
// the verbatim check. One definition, used by the Assistant message and the
// Review cell inspector.
export function citationLabel(
  citation: Pick<VerifiedCitation, "docId" | "quote" | "section" | "page" | "verified">,
  documents: Array<{ id: string; title: string | null; filename: string }>,
): string {
  let label = citationDocName(citation, documents);
  if (citation.section) label += ` ${citation.section}`;
  if (citation.page != null) label += ` · p.${citation.page}`;
  if (!citation.verified) label += " · unverified";
  return label;
}
