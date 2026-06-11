import type { Document } from "@prisma/client";

import { assistantPromptStrategy } from "@/lib/contract";

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
 * Each doc becomes `===== DOCUMENT: <name> =====` then its full extracted text;
 * blocks are joined by a blank line in selection order.
 */
export function renderDocuments(docs: Document[]): string {
  return docs
    .map((d) => `===== DOCUMENT: ${documentName(d)} =====\n${d.extractedText}`)
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
