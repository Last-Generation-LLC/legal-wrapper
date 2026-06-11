// Real document fixtures for tests.
//
// We generate genuine PDF/DOCX bytes in-memory (rather than mocking the
// parsers) so the extraction tests exercise pdf-parse and mammoth against real
// files — testing real behavior, not a stand-in.

import { PDFDocument, StandardFonts } from "pdf-lib";
import { Document, Packer, Paragraph, TextRun } from "docx";

/** Build a single-page PDF containing `text`. */
export async function makePdf(text: string): Promise<Buffer> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([612, 792]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  page.drawText(text, { x: 50, y: 700, size: 18, font });
  return Buffer.from(await doc.save());
}

/** Build a blank single-page PDF with no text — simulates a scanned/image PDF. */
export async function makeBlankPdf(): Promise<Buffer> {
  const doc = await PDFDocument.create();
  doc.addPage([612, 792]);
  return Buffer.from(await doc.save());
}

/** Build a .docx document whose body contains `text`. */
export async function makeDocx(text: string): Promise<Buffer> {
  const doc = new Document({
    sections: [{ children: [new Paragraph({ children: [new TextRun(text)] })] }],
  });
  return await Packer.toBuffer(doc);
}

/**
 * Build a multi-page PDF — one page per entry in `pages`. An empty string
 * yields a page with no drawn text (used to simulate a scanned/text-less page).
 */
export async function makeMultiPagePdf(pages: string[]): Promise<Buffer> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (const text of pages) {
    const page = doc.addPage([612, 792]);
    if (text.length > 0) page.drawText(text, { x: 50, y: 700, size: 18, font });
  }
  return Buffer.from(await doc.save());
}
