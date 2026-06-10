import type { Document } from "@prisma/client";

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
