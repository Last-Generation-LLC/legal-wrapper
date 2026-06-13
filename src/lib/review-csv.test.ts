import { describe, expect, it } from "vitest";
import type { VerifiedAnswer } from "@/lib/contract";
import { cellKey, type CellMap, type CellUsage } from "@/lib/review-grid";
import { csvField, csvFilename, gridToCsv } from "./review-csv";

const usage: CellUsage = {
  uncachedInputTokens: 1,
  cacheReadInputTokens: 0,
  cacheWriteInputTokens: 0,
  outputTokens: 1,
};

function done(answer: Partial<VerifiedAnswer>) {
  return {
    status: "done" as const,
    answer: { value: "v", citations: [], confidence: 0.95, ...answer },
    usage,
    promptUsed: "p",
  };
}

const doc = (id: string) => ({ id, filename: `${id}.pdf`, title: null });
const col = (id: string, title: string) => ({ id, title, prompt: "p", width: 100 });

describe("csvField", () => {
  it("passes plain values through unquoted", () => {
    expect(csvField("Delaware")).toBe("Delaware");
  });

  it.each([
    ["comma", "a, b", '"a, b"'],
    ["newline", "a\nb", '"a\nb"'],
    ["quotes", 'say "yes"', '"say ""yes"""'],
  ])("quotes and escapes values with a %s", (_label, input, expected) => {
    expect(csvField(input)).toBe(expected);
  });

  it.each(["=HYPERLINK(\"http://x\")", "+1", "-2", "@cmd", "\tx"])(
    "neutralizes formula-injection value %j with a leading apostrophe",
    (input) => {
      expect(csvField(input).replace(/^"/, "")).toMatch(/^'/);
    },
  );
});

describe("gridToCsv", () => {
  it("emits value/confidence/citation columns per prompt, one row per doc", () => {
    const cells: CellMap = {
      [cellKey("d1", "c1")]: done({
        value: "Delaware",
        confidence: 0.97,
        citations: [
          { docId: "d1", quote: "the quote here", section: "§14.1", page: 6, verified: true },
        ],
      }),
      [cellKey("d2", "c1")]: { status: "error", message: "rate limited" },
      // d3/c1 idle — absent
    };
    const csv = gridToCsv([doc("d1"), doc("d2"), doc("d3")], [col("c1", "Governing law")], cells);
    const lines = csv.split("\r\n");
    expect(lines).toEqual([
      "Document,Governing law,Governing law · confidence,Governing law · citation",
      "d1.pdf,Delaware,0.97,p.6 · §14.1",
      "d2.pdf,error: rate limited,,",
      "d3.pdf,,,",
    ]);
  });

  it("escapes commas and quotes inside answer values", () => {
    const cells: CellMap = {
      [cellKey("d1", "c1")]: done({ value: 'Mutual, per "Recitals"' }),
    };
    const csv = gridToCsv([doc("d1")], [col("c1", "Mutual?")], cells);
    expect(csv.split("\r\n")[1]).toBe('d1.pdf,"Mutual, per ""Recitals""",0.95,');
  });

  it("escapes user-typed column titles in the header row", () => {
    const csv = gridToCsv([doc("d1")], [col("c1", 'Term, years "approx"')], {});
    expect(csv.split("\r\n")[0]).toBe(
      'Document,"Term, years ""approx""","Term, years ""approx"" · confidence","Term, years ""approx"" · citation"',
    );
  });

  it("uses the document title over the filename when set", () => {
    const csv = gridToCsv(
      [{ id: "d1", filename: "x.pdf", title: "Acme NDA" }],
      [col("c1", "T")],
      {},
    );
    expect(csv.split("\r\n")[1]).toBe("Acme NDA,,,");
  });
});

describe("csvFilename", () => {
  it("stamps the local date", () => {
    expect(csvFilename(new Date(2026, 5, 12))).toBe("review-grid-2026-06-12.csv");
  });
});
