import { afterEach, describe, expect, it, vi } from "vitest";
import type { VerifiedAnswer } from "@/lib/contract";
import {
  cellCitationLabel,
  cellKey,
  COLUMNS_STORAGE_KEY,
  fetchCell,
  gridCounts,
  loadColumns,
  needsRun,
  newColumn,
  regenerateCell,
  runGrid,
  saveColumns,
  Semaphore,
  STARTER_COLUMNS,
  type CellMap,
  type CellResult,
  type CellUsage,
  type ReviewColumn,
} from "./review-grid";

const usage: CellUsage = {
  inputTokens: 100,
  outputTokens: 20,
  cacheReadInputTokens: 0,
  cacheCreationInputTokens: 0,
};

function answerOf(value: string): VerifiedAnswer {
  return { value, citations: [], confidence: 0.95 };
}

function doneCell(promptUsed: string): CellResult {
  return { status: "done", answer: answerOf("x"), usage, promptUsed };
}

function col(id: string, prompt = `prompt-${id}`): ReviewColumn {
  return { id, title: id, prompt, width: 200 };
}

function memoryStorage(initial?: string): Pick<Storage, "getItem" | "setItem"> & {
  data: Map<string, string>;
} {
  const data = new Map<string, string>();
  if (initial != null) data.set(COLUMNS_STORAGE_KEY, initial);
  return {
    data,
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
  };
}

describe("loadColumns", () => {
  it("seeds the six handoff starter columns on first visit", () => {
    expect(loadColumns(memoryStorage())).toEqual(STARTER_COLUMNS);
    expect(STARTER_COLUMNS).toHaveLength(6);
  });

  it("returns the stored columns when they parse", () => {
    const stored = [col("mine", "What is the cap?")];
    expect(loadColumns(memoryStorage(JSON.stringify(stored)))).toEqual(stored);
  });

  it.each([
    ["malformed JSON", "{nope"],
    ["wrong shape", JSON.stringify([{ id: "x" }])],
    ["empty array", "[]"],
  ])("falls back to starters on %s", (_label, raw) => {
    expect(loadColumns(memoryStorage(raw))).toEqual(STARTER_COLUMNS);
  });
});

describe("saveColumns", () => {
  it("round-trips through loadColumns", () => {
    const storage = memoryStorage();
    const columns = [col("a"), col("b")];
    saveColumns(storage, columns);
    expect(loadColumns(storage)).toEqual(columns);
  });
});

describe("newColumn", () => {
  it("creates a blank column with a unique id", () => {
    const a = newColumn();
    const b = newColumn();
    expect(a.id).not.toBe(b.id);
    expect(a.prompt).toBe("");
  });
});

describe("needsRun", () => {
  it("runs idle (absent) cells", () => {
    expect(needsRun(undefined, "p")).toBe(true);
  });

  it("leaves in-flight cells alone", () => {
    expect(needsRun({ status: "running" }, "p")).toBe(false);
  });

  it("retries error cells", () => {
    expect(needsRun({ status: "error", message: "boom" }, "p")).toBe(true);
  });

  it("never re-bills a done cell with an unchanged prompt", () => {
    expect(needsRun(doneCell("p"), "p")).toBe(false);
  });

  it("re-runs a done cell whose column prompt changed", () => {
    expect(needsRun(doneCell("old prompt"), "new prompt")).toBe(true);
  });
});

describe("gridCounts", () => {
  it("tallies done/running/error against the full doc × column total", () => {
    const columns = [col("c1"), col("c2")];
    const cells: CellMap = {
      [cellKey("d1", "c1")]: doneCell("p"),
      [cellKey("d1", "c2")]: { status: "running" },
      [cellKey("d2", "c1")]: { status: "error", message: "x" },
      // d2/c2 idle — absent
    };
    expect(gridCounts(["d1", "d2"], columns, cells)).toEqual({
      total: 4,
      done: 1,
      running: 1,
      error: 1,
    });
  });
});

describe("cellCitationLabel", () => {
  const cite = (over: Partial<VerifiedAnswer["citations"][number]>) => ({
    value: "v",
    confidence: 0.9,
    citations: [{ docId: "d", quote: "q".repeat(12), verified: true, ...over }],
  });

  it("returns null for an uncited answer", () => {
    expect(cellCitationLabel(answerOf("v"))).toBeNull();
  });

  it("joins page and section", () => {
    expect(cellCitationLabel(cite({ page: 6, section: "§14.1" }))).toBe("p.6 · §14.1");
  });

  it("degrades to 'cited' when the citation has neither page nor section", () => {
    expect(cellCitationLabel(cite({}))).toBe("cited");
  });

  it("flags unverified citations", () => {
    expect(cellCitationLabel(cite({ section: "§3", verified: false }))).toBe(
      "§3 · unverified",
    );
  });
});

describe("fetchCell", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("returns the route's success body", async () => {
    const body = { answer: answerOf("Delaware"), usage };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json(body)));
    await expect(fetchCell("d1", "p")).resolves.toEqual(body);
    expect(fetch).toHaveBeenCalledWith("/api/review/cell", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ docId: "d1", prompt: "p" }),
    });
  });

  it("throws the route's error message on a non-OK response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(Response.json({ error: "Rate limited" }, { status: 429 })),
    );
    await expect(fetchCell("d1", "p")).rejects.toThrow("Rate limited");
  });

  it("falls back to the status code when the error body is not JSON", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("gateway buckled", { status: 502 })),
    );
    await expect(fetchCell("d1", "p")).rejects.toThrow("Request failed (502)");
  });
});

describe("Semaphore", () => {
  it("never lets more than `limit` tasks run at once", async () => {
    const semaphore = new Semaphore(2);
    let active = 0;
    let peak = 0;
    const task = async () => {
      active++;
      peak = Math.max(peak, active);
      await Promise.resolve();
      active--;
    };
    await Promise.all(Array.from({ length: 8 }, () => semaphore.run(task)));
    expect(peak).toBe(2);
  });

  it("releases its slot when a task throws", async () => {
    const semaphore = new Semaphore(1);
    await expect(semaphore.run(() => Promise.reject(new Error("boom")))).rejects.toThrow();
    await expect(semaphore.run(() => Promise.resolve("ok"))).resolves.toBe("ok");
  });
});

describe("runGrid", () => {
  const columns = [col("c1"), col("c2"), col("c3")];

  function instrumentedRunner() {
    const calls: Array<{ docId: string; prompt: string }> = [];
    let active = 0;
    let peak = 0;
    const runCell = vi.fn(async (docId: string, prompt: string) => {
      calls.push({ docId, prompt });
      active++;
      peak = Math.max(peak, active);
      await new Promise((r) => setTimeout(r, 1));
      active--;
      return { answer: answerOf(`${docId}/${prompt}`), usage };
    });
    return { calls, runCell, peakInFlight: () => peak };
  }

  it("warms one cell per document before fanning out the rest", async () => {
    const { runCell } = instrumentedRunner();
    const starts: string[] = [];
    const warmDone: string[] = [];
    const tracked = vi.fn(async (docId: string, prompt: string) => {
      starts.push(`${docId}:${prompt}`);
      const result = await runCell(docId, prompt);
      if (prompt === columns[0].prompt) warmDone.push(docId);
      return result;
    });

    await runGrid({
      docIds: ["d1", "d2"],
      columns,
      cells: {},
      runCell: tracked,
      onUpdate: () => {},
    });

    // For each doc, the warm cell (c1) must have FINISHED before c2/c3 start.
    for (const docId of ["d1", "d2"]) {
      const fanoutStart = starts.findIndex(
        (s) => s.startsWith(`${docId}:`) && !s.endsWith(columns[0].prompt),
      );
      expect(fanoutStart).toBeGreaterThan(-1);
      // The warm completion is observable because fan-out starts strictly after it.
      expect(warmDone).toContain(docId);
    }
    expect(tracked).toHaveBeenCalledTimes(6);
  });

  it("caps global concurrency", async () => {
    const { runCell, peakInFlight } = instrumentedRunner();
    await runGrid({
      docIds: ["d1", "d2", "d3", "d4", "d5", "d6"],
      columns: [col("only")],
      cells: {},
      runCell,
      onUpdate: () => {},
      concurrency: 2,
    });
    expect(peakInFlight()).toBe(2);
  });

  it("marks cells running, then done with the prompt they ran with", async () => {
    const updates: Array<{ colId: string; result: CellResult }> = [];
    await runGrid({
      docIds: ["d1"],
      columns: [col("c1", "the prompt")],
      cells: {},
      runCell: async () => ({ answer: answerOf("v"), usage }),
      onUpdate: (_docId, colId, result) => updates.push({ colId, result }),
    });
    expect(updates.map((u) => u.result.status)).toEqual(["running", "done"]);
    const done = updates[1].result;
    expect(done.status === "done" && done.promptUsed).toBe("the prompt");
  });

  it("skips done cells with unchanged prompts, re-runs prompt-changed ones", async () => {
    const { calls, runCell } = instrumentedRunner();
    const cells: CellMap = {
      [cellKey("d1", "c1")]: doneCell(columns[0].prompt), // unchanged — skip
      [cellKey("d1", "c2")]: doneCell("an older prompt"), // changed — re-run
      // c3 idle — run
    };
    await runGrid({ docIds: ["d1"], columns, cells, runCell, onUpdate: () => {} });
    expect(calls.map((c) => c.prompt).sort()).toEqual(
      [columns[1].prompt, columns[2].prompt].sort(),
    );
  });

  it("does not attempt a document's remaining cells when its warm cell fails", async () => {
    const runCell = vi.fn().mockRejectedValue(new Error("prompt too long"));
    const updates: Array<{ colId: string; result: CellResult }> = [];
    await runGrid({
      docIds: ["d1"],
      columns,
      cells: {},
      runCell,
      onUpdate: (_docId, colId, result) => updates.push({ colId, result }),
    });

    expect(runCell).toHaveBeenCalledTimes(1); // warm only — no full-price fan-out
    const errors = updates.filter((u) => u.result.status === "error");
    expect(errors.map((u) => u.colId).sort()).toEqual(["c1", "c2", "c3"]);
    const skipped = errors.find((u) => u.colId === "c2")!.result;
    expect(skipped.status === "error" && skipped.message).toMatch(/warm-up/);
  });

  it("a failed warm cell on one document does not stop other documents", async () => {
    const runCell = vi.fn(async (docId: string) => {
      if (docId === "d1") throw new Error("doc too long");
      return { answer: answerOf("ok"), usage };
    });
    const doneCols: string[] = [];
    await runGrid({
      docIds: ["d1", "d2"],
      columns,
      cells: {},
      runCell,
      onUpdate: (docId, colId, result) => {
        if (result.status === "done") doneCols.push(`${docId}:${colId}`);
      },
    });
    expect(doneCols.sort()).toEqual(["d2:c1", "d2:c2", "d2:c3"]);
  });
});

describe("regenerateCell", () => {
  const col = { id: "c1", title: "Governing law", prompt: "What law?", width: 160 };
  const answer = { value: "Delaware", citations: [], confidence: 0.9 };
  const usage = {
    inputTokens: 100,
    outputTokens: 10,
    cacheReadInputTokens: 0,
    cacheCreationInputTokens: 0,
  };

  it("transitions running → done on success, stamping promptUsed", async () => {
    const updates: Array<[string, string, unknown]> = [];
    await regenerateCell({
      docId: "d1",
      col,
      runCell: async () => ({ answer, usage }),
      onUpdate: (docId, colId, result) => updates.push([docId, colId, result]),
    });
    expect(updates[0]).toEqual(["d1", "c1", { status: "running" }]);
    expect(updates[1]).toEqual([
      "d1",
      "c1",
      { status: "done", answer, usage, promptUsed: "What law?" },
    ]);
  });

  it("transitions running → error when the call throws", async () => {
    const updates: Array<[string, string, unknown]> = [];
    await regenerateCell({
      docId: "d1",
      col,
      runCell: async () => {
        throw new Error("Rate limited by the model API — retry shortly.");
      },
      onUpdate: (docId, colId, result) => updates.push([docId, colId, result]),
    });
    expect(updates[0]).toEqual(["d1", "c1", { status: "running" }]);
    expect(updates[1]).toEqual([
      "d1",
      "c1",
      { status: "error", message: "Rate limited by the model API — retry shortly." },
    ]);
  });
});
