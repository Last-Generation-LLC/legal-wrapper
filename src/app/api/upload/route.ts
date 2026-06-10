import { prisma } from "@/lib/prisma";
import { countTokens } from "@/lib/tokens";
import {
  extractText,
  isSupportedMimeType,
  ExtractionError,
  UnsupportedFileTypeError,
  PDF_MIME,
  DOCX_MIME,
} from "@/lib/extract";

// pdf-parse and mammoth are Node-only — this route must not run on the Edge.
export const runtime = "nodejs";

// 25 MB. Generous for native PDFs/DOCX at demo scale while bounding memory:
// the file is read fully into a Buffer to parse.
const MAX_FILE_BYTES = 25 * 1024 * 1024;

/**
 * Resolve a supported MIME type for the upload. Prefer the browser-provided
 * `file.type`; if it's missing or generic (common with curl / some clients),
 * fall back to the filename extension so a correctly-named file still works.
 * Returns null when we can't confidently identify a supported type.
 */
function resolveMimeType(file: File): string | null {
  if (isSupportedMimeType(file.type)) return file.type;
  const name = file.name.toLowerCase();
  if (name.endsWith(".pdf")) return PDF_MIME;
  if (name.endsWith(".docx")) return DOCX_MIME;
  return null;
}

function error(message: string, status: number) {
  return Response.json({ error: message }, { status });
}

export async function POST(request: Request) {
  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return error(
      "Could not read upload. Send multipart/form-data with a 'file' field.",
      400,
    );
  }

  const file = formData.get("file");
  if (!(file instanceof File)) {
    return error("No file provided. Include a file in the 'file' field.", 400);
  }

  if (file.size === 0) {
    return error("The uploaded file is empty.", 400);
  }
  if (file.size > MAX_FILE_BYTES) {
    return error(
      `File is too large (${(file.size / 1024 / 1024).toFixed(1)} MB). Maximum is ${MAX_FILE_BYTES / 1024 / 1024} MB.`,
      413,
    );
  }

  const mimeType = resolveMimeType(file);
  if (mimeType === null) {
    return error(
      `Unsupported file type "${file.type || "unknown"}". Only PDF and DOCX files are supported.`,
      400,
    );
  }

  const buffer = Buffer.from(await file.arrayBuffer());

  let text: string;
  try {
    ({ text } = await extractText(buffer, mimeType));
  } catch (err) {
    if (err instanceof UnsupportedFileTypeError) {
      return error(err.message, 400);
    }
    if (err instanceof ExtractionError) {
      // 422: the request was well-formed but we couldn't process the contents.
      return error(err.message, 422);
    }
    throw err;
  }

  const { count, estimated } = await countTokens(text);

  const document = await prisma.document.create({
    data: {
      filename: file.name,
      mimeType,
      extractedText: text,
      tokenCount: count,
      tokenCountEstimated: estimated,
    },
    // Return metadata only — never echo the full extracted text in the response.
    select: {
      id: true,
      filename: true,
      mimeType: true,
      tokenCount: true,
      tokenCountEstimated: true,
      createdAt: true,
    },
  });

  return Response.json(document, { status: 201 });
}
