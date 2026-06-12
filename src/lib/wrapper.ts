import type { Document } from "@prisma/client";

import { assistantPromptStrategy, reviewPromptStrategy } from "@/lib/contract";

/**
 * The literal token in the system prompt that the composer replaces with the
 * full text of the selected documents at send time.
 */
export const DOCUMENTS_TOKEN = "{{DOCUMENTS}}";

/**
 * The shipped default system prompt — adopted verbatim from the design mock
 * (`design_handoff_legal_wrapper/components/assistant.jsx`, `DEFAULT_SYS_PROMPT`).
 * It is editable at runtime (the transparency thesis), so this only needs to be
 * a strong starting point. The trailing `{{DOCUMENTS}}` is filled per call.
 */
export const DEFAULT_SYSTEM_PROMPT = `You are a contract review assistant for an in-house legal team.

# Behavior
- Ground every factual claim in the attached documents. If a document does not address a point, say so explicitly.
- Prefer concrete clause references (section number, page) over summaries.
- When comparing documents, structure the response as a numbered list of material differences.
- Do not hedge with "I am not a lawyer." The user is a lawyer.
- Do not suggest consulting counsel. The user is counsel.

# Output
- Plain prose. Short paragraphs. Bold for the top-line finding of each numbered point.
- Cite as [DocName §X, p.N]. No hallucinated page numbers — only cite what you can locate.

# Attached documents
${DOCUMENTS_TOKEN}`;

/** True when a (possibly user-edited) template still contains the token. */
export function templateHasDocumentsToken(template: string): boolean {
  return template.includes(DOCUMENTS_TOKEN);
}

/** Display name for a document: its title if set, otherwise its filename. */
function documentName(doc: Pick<Document, "filename" | "title">): string {
  return doc.title && doc.title.trim().length > 0 ? doc.title : doc.filename;
}

/**
 * Render the selected documents into the block that replaces `{{DOCUMENTS}}`.
 * Each doc becomes `===== DOCUMENT: <name> (id: <id>) =====` then its full
 * extracted text; blocks are joined by a blank line in selection order. The
 * Prisma id is shown so the model can cite a `docId` that `verifyAnswer` can
 * actually look up — without it, citations could never verify.
 */
export function renderDocuments(docs: Document[]): string {
  return docs
    .map((d) => `===== DOCUMENT: ${documentName(d)} (id: ${d.id}) =====\n${d.extractedText}`)
    .join("\n\n");
}

/**
 * Compose the final system prompt sent to Claude by filling the documents token.
 *
 * Pure and server-side (locked decision). If `template` contains
 * `{{DOCUMENTS}}`, every occurrence is replaced with the rendered block. If it
 * does not (an edited prompt that dropped the token), the block is appended at
 * the end rather than silently lost — callers use `templateHasDocumentsToken`
 * to detect this and surface a warning in the UI.
 *
 * Uses split/join for *literal* replacement; `String.replace`/`replaceAll`
 * would interpret `$&`/`$1`/`$$` in the document text.
 */
export function composeSystemPrompt(
  docs: Document[],
  template: string = DEFAULT_SYSTEM_PROMPT,
): string {
  const block = renderDocuments(docs);
  if (templateHasDocumentsToken(template)) {
    return template.split(DOCUMENTS_TOKEN).join(block);
  }
  return `${template}\n\n# Attached documents\n${block}`;
}

/**
 * The COMPLETE Assistant system prompt: the (possibly user-edited) template
 * with documents filled, then the citation/confidence strategy block.
 * Fixed order, nothing else (locked transparency decision) — the prompt panel
 * (#11) renders exactly these two pieces, so what the user sees is what the
 * model receives. The strategy block is appended (not part of the editable
 * template) so an edit cannot break the footer protocol the route parses.
 */
export function composeAssistantSystemPrompt(
  docs: Document[],
  template: string = DEFAULT_SYSTEM_PROMPT,
): string {
  return `${composeSystemPrompt(docs, template)}\n\n${assistantPromptStrategy()}`;
}

/**
 * The shipped default system prompt for Review grid cells. Tuned for the
 * grid's shape: every answer lands in a small table cell, so brevity and a
 * fixed "or say so" fallback beat prose. Editable at runtime like the
 * Assistant default (transparency thesis); `{{DOCUMENTS}}` is filled per call
 * with the SINGLE document under review.
 */
export const DEFAULT_REVIEW_SYSTEM_PROMPT = `You are extracting a specific answer from one legal document for a review grid.

# Behavior
- Answer ONLY the question asked, from the attached document alone.
- Be concise: the answer goes in a table cell. One sentence or less when possible; follow any output format the question specifies.
- If the document does not address the question, answer exactly "Not specified." — never guess.
- Do not hedge with "I am not a lawyer." The user is a lawyer.

# Attached document
${DOCUMENTS_TOKEN}`;

/**
 * The COMPLETE Review-cell system prompt: the (possibly user-edited) template
 * with the single document filled, then the forced-tool-use strategy block.
 * Same fixed two-piece order as the Assistant composition.
 *
 * CACHE PREFIX INVARIANT: this string must be byte-identical for every cell
 * against the same document (same template), because the route puts a
 * cache_control breakpoint on it — the varying column prompt rides the user
 * message AFTER the breakpoint. Keep anything per-call (timestamps, cell ids)
 * out of here.
 */
export function composeReviewSystemPrompt(
  doc: Document,
  template: string = DEFAULT_REVIEW_SYSTEM_PROMPT,
): string {
  return `${composeSystemPrompt([doc], template)}\n\n${reviewPromptStrategy()}`;
}
