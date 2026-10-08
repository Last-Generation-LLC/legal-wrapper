// Pure verification + confidence logic for the citation contract (decision n1).
// No I/O, no SDK calls — just functions over strings and the contract types,
// which is what makes the anti-fabrication guard cheaply unit-testable.

import {
  FAILED_CITATION_CONFIDENCE_CAP,
  TRUNCATION_MARK,
  type RawAnswer,
  type VerifiedAnswer,
  type VerifiedCitation,
} from "@/lib/contract";

/** Collapse any run of whitespace to a single space and trim. */
export function normalizeWhitespace(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

/** Drop the clipQuote marker so a clipped quote is matched by its kept prefix. */
function stripTruncationMark(quote: string): string {
  return quote.endsWith(TRUNCATION_MARK) ? quote.slice(0, -TRUNCATION_MARK.length) : quote;
}

/**
 * The anti-fabrication guard (decision d1): the quote must appear verbatim in
 * the document text, compared with whitespace normalized so source line-wraps
 * don't cause false failures. Strict substring otherwise.
 */
export function verifyCitation(quote: string, docText: string): boolean {
  const q = normalizeWhitespace(stripTruncationMark(quote));
  if (q.length === 0) return false;
  return normalizeWhitespace(docText).includes(q);
}

/** Escape a string for safe literal use inside a RegExp. */
function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Matches pdf-parse's page markers and captures the page number. Global so we
// can walk every marker in document order; not anchored (we scan within the body).
const PAGE_MARKER_GLOBAL = /-- (\d+) of \d+ --/g;

/**
 * Derive the page a quote sits on by locating the quote in the raw document
 * text (whitespace-flexible) and reading the marker that TERMINATES its page
 * (decision n4). pdf-parse emits "-- N of M --" as a TRAILING separator that
 * FOLLOWS page N's content (empirically confirmed:
 * "body1\n\n-- 1 of 2 --\n\nbody2\n\n-- 2 of 2 --"), so the page is the first
 * marker positioned after the quote — not the nearest preceding one. Returns
 * undefined when the quote can't be located or the text has no markers (DOCX,
 * or PDFs stored before the marker-preservation change).
 */
export function derivePage(docText: string, quote: string): number | undefined {
  const tokens = normalizeWhitespace(stripTruncationMark(quote))
    .split(" ")
    .filter((t) => t.length > 0)
    .map(escapeRegExp);
  if (tokens.length === 0) return undefined;

  const flexible = new RegExp(tokens.join("\\s+"));
  const match = flexible.exec(docText);
  if (!match) return undefined;
  const quoteIndex = match.index;

  // Markers are emitted in document order; the first one positioned after the
  // quote is the marker that closes the quote's page (trailing-separator layout).
  for (const marker of docText.matchAll(PAGE_MARKER_GLOBAL)) {
    if (marker.index !== undefined && marker.index > quoteIndex) {
      return Number(marker[1]);
    }
  }
  return undefined;
}

/**
 * Apply the confidence downgrade (decisions d4/n5): if any citation failed its
 * quote check, cap the whole answer's confidence at the low band. Never raises
 * an already-lower score.
 */
export function applyConfidence(raw: number, anyUnverified: boolean): number {
  return anyUnverified ? Math.min(raw, FAILED_CITATION_CONFIDENCE_CAP) : raw;
}

/**
 * Verify a raw model answer against the source documents (keyed by id) and
 * return the annotated answer consumers render: each citation flagged
 * verified/unverified (keep-but-flag, decision n3) with a derived page, and the
 * confidence downgraded if anything failed.
 */
export function verifyAnswer(
  answer: RawAnswer,
  docTextById: Map<string, string>,
): VerifiedAnswer {
  const citations: VerifiedCitation[] = answer.citations.map((c) => {
    const docText = docTextById.get(c.docId);
    const verified = docText ? verifyCitation(c.quote, docText) : false;
    const page = verified && docText ? derivePage(docText, c.quote) : undefined;
    return { ...c, verified, page };
  });
  const anyUnverified = citations.some((c) => !c.verified);
  return {
    value: answer.value,
    citations,
    confidence: applyConfidence(answer.confidence, anyUnverified),
  };
}
