// The shared citation + confidence contract consumed by BOTH tabs.
//
// One shape (`{ value, citations[], confidence }`), two emission modes
// (decision d5): the Review grid forces structured JSON via Anthropic tool-use;
// the Assistant streams prose then appends a delimited JSON footer. This module
// owns the shape, the anti-fabrication prompt strategy, and the emission
// helpers. The pure verification/confidence logic lives in `./citation.ts`.

import * as z from "zod";

/**
 * Quote length bounds — long enough to be a real anchor, short enough to be a
 * snippet. The max is roomy because legal clauses run long; anything the model
 * sends past it is clipped (see clipQuote), never rejected or reworded.
 */
export const MIN_QUOTE_LENGTH = 12;
export const MAX_QUOTE_LENGTH = 600;

/** Appended to a clipped quote so the reader knows the source continues. */
export const TRUNCATION_MARK = "…";

/**
 * Confidence cap applied to the WHOLE answer when any citation fails the quote
 * check (decisions n5/d4). Mirrors the tokens.ts honesty ethic: a number we
 * can't stand behind is forced into the low band, never shown at face value.
 */
export const FAILED_CITATION_CONFIDENCE_CAP = 0.3;

/** A single supporting citation as emitted by the model (before verification). */
export const RawCitationSchema = z.object({
  docId: z
    .string()
    .min(1)
    .describe("The id of the source document this citation supports."),
  quote: z
    .string()
    .min(MIN_QUOTE_LENGTH)
    .max(MAX_QUOTE_LENGTH)
    .describe(
      "A short VERBATIM quote copied exactly from the source document text — never paraphrased.",
    ),
  section: z
    .string()
    .optional()
    .describe("The section label if identifiable, e.g. §12.3."),
});

/** The full answer shape both tabs produce. */
export const RawAnswerSchema = z.object({
  value: z.string().describe("The answer text for the user."),
  citations: z
    .array(RawCitationSchema)
    .describe("Supporting citations, each a verbatim quote from the documents."),
  confidence: z
    .number()
    .min(0)
    .max(1)
    .describe(
      "How well the attached documents support this answer, in [0,1]. NOT a probability that the answer is correct.",
    ),
});

/** The Assistant footer = the answer shape minus `value` (the prose IS the value). */
export const RawFooterSchema = RawAnswerSchema.omit({ value: true });

export type RawCitation = z.infer<typeof RawCitationSchema>;
export type RawAnswer = z.infer<typeof RawAnswerSchema>;
export type RawFooter = z.infer<typeof RawFooterSchema>;

/** A citation after server-side verification (the shape consumers render). */
export interface VerifiedCitation extends RawCitation {
  /** true when `quote` was found in the cited document's text (decision d1). */
  verified: boolean;
  /** Page number derived from the `-- N of M --` markers; PDF-only, else undefined (d3/n4). */
  page?: number;
}

/** A fully verified answer: annotated citations + a possibly-downgraded confidence. */
export interface VerifiedAnswer {
  value: string;
  citations: VerifiedCitation[];
  confidence: number;
}

/** Tool name the Review grid forces the model to call (decision d5). */
export const REVIEW_TOOL_NAME = "submit_answer";

/**
 * Clip an over-long quote to MAX_QUOTE_LENGTH at a word boundary and mark it
 * with TRUNCATION_MARK. The kept text is an exact prefix of what the model
 * quoted — shortened, never paraphrased — so it still verifies against the
 * source (citation.ts strips the mark before matching).
 */
export function clipQuote(quote: string): string {
  if (quote.length <= MAX_QUOTE_LENGTH) return quote;
  const room = quote.slice(0, MAX_QUOTE_LENGTH - TRUNCATION_MARK.length + 1);
  const cut = room.search(/\s\S*$/); // last whitespace; drop the partial word after it
  const kept = (cut > 0 ? room.slice(0, cut) : room.slice(0, -1)).trimEnd();
  return kept + TRUNCATION_MARK;
}

/**
 * Apply clipQuote to every citation in raw model output BEFORE schema
 * validation, so one long quote no longer fails an otherwise-good answer.
 * Anything not shaped like { citations: [...] } passes through untouched for
 * the schema to reject as before.
 */
export function clipCitationQuotes(input: unknown): unknown {
  if (typeof input !== "object" || input === null) return input;
  const { citations } = input as { citations?: unknown };
  if (!Array.isArray(citations)) return input;
  return {
    ...input,
    citations: citations.map((c: unknown) =>
      typeof c === "object" && c !== null && typeof (c as { quote?: unknown }).quote === "string"
        ? { ...c, quote: clipQuote((c as { quote: string }).quote) }
        : c,
    ),
  };
}

/** Delimiters bracketing the Assistant's machine-readable JSON footer (decision d5). */
export const FOOTER_OPEN = "<<<CITATIONS_JSON>>>";
export const FOOTER_CLOSE = "<<<END_CITATIONS_JSON>>>";

// The shared anti-fabrication instructions both modes prepend. References the
// page markers extract.ts now preserves so the model can cite a real page.
const CITATION_CORE = `# Citations and confidence
- When documents are attached, support factual claims about them with citations drawn ONLY from the attached documents. If the documents do not address a point, say so — never invent support. When no documents are attached, answer from your general legal knowledge and leave the citations empty.
- Every citation must include a SHORT VERBATIM QUOTE copied exactly from the document text (${MIN_QUOTE_LENGTH}-${MAX_QUOTE_LENGTH} characters), not a paraphrase. If you cannot quote it, do not cite it.
- Quote the most relevant language: the specific words that support the answer, not the whole clause. For a long clause, quote only its operative sentence or phrase. Each quote must be one continuous passage — never splice passages together or use ellipses.
- Identify the source document by its id (shown in each document's header), and include the section label (e.g. "§12.3") when you can.
- The document text contains page-boundary lines of the form "-- N of M --". Never quote these lines, but use them to know which page a passage is on. Do not invent page numbers.
- Provide a confidence value in [0,1], not your certainty that the answer is correct. When documents are attached, it means HOW WELL THE ATTACHED DOCUMENTS SUPPORT YOUR ANSWER — lower it when the documents are silent or only partially on point. When no documents are attached, it means the strength of your general legal answer — lower it when the question is jurisdiction-dependent or turns on facts you don't have.`;

/** Prompt strategy for the Review grid: structured output via forced tool-use. */
export function reviewPromptStrategy(): string {
  return `${CITATION_CORE}
- Return your answer by calling the \`${REVIEW_TOOL_NAME}\` tool: put the answer in \`value\`, the supporting verbatim quotes in \`citations\`, and your document-support score in \`confidence\`.`;
}

/** Prompt strategy for the Assistant: stream prose, then a delimited JSON footer. */
export function assistantPromptStrategy(): string {
  return `${CITATION_CORE}

# Output format
- Write your answer as ordinary prose for the user to read.
- AFTER the prose, append a machine-readable footer on its own lines: the marker ${FOOTER_OPEN}, then a single JSON object {"citations": [ {"docId": "...", "quote": "...", "section": "..."} ], "confidence": 0.0}, then the marker ${FOOTER_CLOSE}. Put nothing after the closing marker.`;
}

/** Result of splitting a (possibly streaming) Assistant message into prose + footer. */
export interface ParsedAssistant {
  /** The prose answer with the footer removed. */
  value: string;
  /** The parsed footer, or null if absent, not yet closed, or malformed. */
  footer: RawFooter | null;
}

/**
 * Build the Anthropic tool definition the Review grid forces (decision d5). The
 * input schema is generated from RawAnswerSchema so the shape has ONE source of
 * truth. #11 passes this with tool_choice { type: "tool", name: REVIEW_TOOL_NAME }.
 */
export function buildReviewTool() {
  return {
    name: REVIEW_TOOL_NAME,
    description:
      "Submit the grounded answer with supporting verbatim citations and a document-support confidence score.",
    input_schema: z.toJSONSchema(RawAnswerSchema) as Record<string, unknown>,
  };
}

/**
 * Split a (possibly mid-stream) Assistant message into prose `value` and the
 * parsed footer. Tolerant by design (risk n8): no footer, an unclosed footer
 * still streaming, or malformed JSON all return `footer: null` without throwing
 * — only a complete, well-formed, schema-valid footer parses.
 */
export function parseAssistantFooter(text: string): ParsedAssistant {
  const openIdx = text.indexOf(FOOTER_OPEN);
  if (openIdx === -1) return { value: text.trim(), footer: null };

  const value = text.slice(0, openIdx).trim();
  const closeIdx = text.indexOf(FOOTER_CLOSE, openIdx + FOOTER_OPEN.length);
  if (closeIdx === -1) return { value, footer: null }; // not closed yet (streaming)

  const json = text.slice(openIdx + FOOTER_OPEN.length, closeIdx).trim();
  try {
    const parsed = RawFooterSchema.safeParse(clipCitationQuotes(JSON.parse(json)));
    return { value, footer: parsed.success ? parsed.data : null };
  } catch {
    return { value, footer: null }; // malformed JSON — degrade, don't throw
  }
}
