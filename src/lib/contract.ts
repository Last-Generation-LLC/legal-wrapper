// The shared citation + confidence contract consumed by BOTH tabs.
//
// One shape (`{ value, citations[], confidence }`), two emission modes
// (decision d5): the Review grid forces structured JSON via Anthropic tool-use;
// the Assistant streams prose then appends a delimited JSON footer. This module
// owns the shape, the anti-fabrication prompt strategy, and the emission
// helpers. The pure verification/confidence logic lives in `./citation.ts`.

import * as z from "zod";

/** Quote length bounds — long enough to be a real anchor, short enough to be a snippet. */
export const MIN_QUOTE_LENGTH = 12;
export const MAX_QUOTE_LENGTH = 300;

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
