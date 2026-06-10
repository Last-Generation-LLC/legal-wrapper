// Document text extraction.
//
// This is the single seam between "raw uploaded bytes" and "plain text we can
// send to Claude". Everything downstream (token counting, persistence, the
// Assistant, the Review grid) consumes the plain text this module produces.
//
// It is deliberately a narrow interface — `extractText(buffer, mimeType)` —
// so a hosted parser (LlamaParse, Reducto) can be swapped in behind it later
// without touching the upload route or anything else, exactly as the project's
// known-risks note anticipates for poor-quality / scanned PDFs.

import { PDFParse } from "pdf-parse";
import mammoth from "mammoth";

export const PDF_MIME = "application/pdf";
export const DOCX_MIME =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

/** The MIME types this extractor accepts. */
export const SUPPORTED_MIME_TYPES = [PDF_MIME, DOCX_MIME] as const;
export type SupportedMimeType = (typeof SUPPORTED_MIME_TYPES)[number];

/** Thrown when the file's MIME type is not one we can extract. */
export class UnsupportedFileTypeError extends Error {
  constructor(public readonly mimeType: string) {
    super(
      `Unsupported file type "${mimeType}". Only PDF and DOCX files are supported.`,
    );
    this.name = "UnsupportedFileTypeError";
  }
}

/**
 * Thrown when a file is the right type but text could not be extracted —
 * a corrupt file, a password-protected PDF, or (most commonly) a scanned PDF
 * with no text layer. We surface this loudly rather than silently saving an
 * empty document, so the failure is debuggable instead of mysterious.
 */
export class ExtractionError extends Error {
  constructor(
    message: string,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = "ExtractionError";
  }
}

export function isSupportedMimeType(
  mimeType: string,
): mimeType is SupportedMimeType {
  return (SUPPORTED_MIME_TYPES as readonly string[]).includes(mimeType);
}

export interface ExtractionResult {
  /** The extracted plain text, trimmed. */
  text: string;
  /** Page count, when the format exposes one (PDF). Undefined for DOCX. */
  pageCount?: number;
}

/**
 * Extract plain text from an uploaded document.
 *
 * @throws {UnsupportedFileTypeError} if `mimeType` is not PDF or DOCX.
 * @throws {ExtractionError} if parsing fails or yields no usable text.
 */
export async function extractText(
  buffer: Buffer,
  mimeType: string,
): Promise<ExtractionResult> {
  if (!isSupportedMimeType(mimeType)) {
    throw new UnsupportedFileTypeError(mimeType);
  }

  const result =
    mimeType === PDF_MIME
      ? await extractPdf(buffer)
      : await extractDocx(buffer);

  // The empty-extraction guard: a right-typed file that yields no text is
  // almost always a scanned/image-only PDF. Treat it as an error, never as a
  // valid empty document.
  if (result.text.length === 0) {
    throw new ExtractionError(
      "No extractable text found. The file may be a scanned image or have no text layer; OCR is not supported.",
    );
  }

  return result;
}

// pdf-parse v2 interleaves a "-- N of M --" separator line between pages in
// getText().text. We strip them so (a) the empty-text guard can actually
// detect a scanned/text-less PDF (which would otherwise contain only these
// markers), and (b) we don't feed pdf-parse's own page chrome to Claude.
const PAGE_MARKER = /^\s*-- \d+ of \d+ --\s*$/gm;

async function extractPdf(buffer: Buffer): Promise<ExtractionResult> {
  // pdf-parse v2: construct with in-memory data, always destroy() to free
  // the underlying pdf.js document.
  const parser = new PDFParse({ data: buffer });
  try {
    const result = await parser.getText();
    const text = result.text.replace(PAGE_MARKER, "").trim();
    return { text, pageCount: result.total };
  } catch (err) {
    throw new ExtractionError(
      "Failed to parse PDF. The file may be corrupt or password-protected.",
      err,
    );
  } finally {
    await parser.destroy();
  }
}

async function extractDocx(buffer: Buffer): Promise<ExtractionResult> {
  try {
    const result = await mammoth.extractRawText({ buffer });
    return { text: result.value.trim() };
  } catch (err) {
    throw new ExtractionError(
      "Failed to parse DOCX. The file may be corrupt or not a valid Word document.",
      err,
    );
  }
}
