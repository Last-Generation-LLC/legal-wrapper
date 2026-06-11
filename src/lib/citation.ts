// Pure verification + confidence logic for the citation contract (decision n1).
// No I/O, no SDK calls — just functions over strings and the contract types,
// which is what makes the anti-fabrication guard cheaply unit-testable.

import {
  type RawAnswer,
  type VerifiedAnswer,
  type VerifiedCitation,
} from "@/lib/contract";

/** Collapse any run of whitespace to a single space and trim. */
export function normalizeWhitespace(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

/**
 * The anti-fabrication guard (decision d1): the quote must appear verbatim in
 * the document text, compared with whitespace normalized so source line-wraps
 * don't cause false failures. Strict substring otherwise.
 */
export function verifyCitation(quote: string, docText: string): boolean {
  const q = normalizeWhitespace(quote);
  if (q.length === 0) return false;
  return normalizeWhitespace(docText).includes(q);
}
