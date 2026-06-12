// Pure CSV serialization of the Review grid (#15). Three CSV columns per
// prompt column — value, confidence, citation — because the confidence score
// and verified citation are the product's differentiating data, not metadata.

import type { DocumentMeta } from "@/lib/documents";
import { docLabel } from "@/lib/doc-display";
import {
  cellCitationLabel,
  cellKey,
  type CellMap,
  type CellResult,
  type ReviewColumn,
} from "@/lib/review-grid";

/**
 * One RFC 4180 field: wrap in quotes when the value contains a comma, quote,
 * or newline (doubling embedded quotes) — plus a formula-injection guard.
 * Cell text is model-derived from UNTRUSTED documents; without the guard a
 * crafted document could smuggle `=HYPERLINK(...)` into a cell that executes
 * when the export is opened in Excel/Sheets. The apostrophe prefix is the
 * spreadsheet convention for "treat as text".
 */
export function csvField(value: string): string {
  const guarded = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return /[",\n\r]/.test(guarded) ? `"${guarded.replaceAll('"', '""')}"` : guarded;
}

/** The three CSV cells a grid cell expands to: value, confidence, citation. */
function cellFields(cell: CellResult | undefined): [string, string, string] {
  if (!cell || cell.status === "running") return ["", "", ""];
  if (cell.status === "error") return [`error: ${cell.message}`, "", ""];
  return [
    cell.answer.value,
    cell.answer.confidence.toFixed(2),
    cellCitationLabel(cell.answer) ?? "",
  ];
}

/** Serialize the grid. Header row, then one row per document, CRLF-joined (RFC 4180). */
export function gridToCsv(
  docs: Pick<DocumentMeta, "id" | "filename" | "title">[],
  columns: ReviewColumn[],
  cells: CellMap,
): string {
  const header = [
    "Document",
    ...columns.flatMap((c) => [c.title, `${c.title} · confidence`, `${c.title} · citation`]),
  ];
  const rows = docs.map((doc) => [
    docLabel(doc),
    ...columns.flatMap((col) => cellFields(cells[cellKey(doc.id, col.id)])),
  ]);
  return [header, ...rows].map((row) => row.map(csvField).join(",")).join("\r\n");
}

/** "review-grid-2026-06-12.csv" — local date so the name matches the user's clock. */
export function csvFilename(now: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `review-grid-${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}.csv`;
}

/**
 * Trigger a client-side download. The UTF-8 BOM makes Excel decode § and
 * other non-ASCII correctly (without it, Excel assumes the system codepage).
 */
export function downloadCsv(csv: string, filename: string): void {
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
