// @vitest-environment jsdom
import { useEffect, useRef } from "react";
import { renderToString } from "react-dom/server";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DocumentMeta } from "@/lib/documents";
import { COLUMNS_STORAGE_KEY, MODEL_STORAGE_KEY, STARTER_COLUMNS } from "@/lib/review-grid";
import { DocsProvider, useDocs } from "@/components/documents/docs-context";
import { downloadCsv } from "@/lib/review-csv";
import { ReviewScreen } from "./review-screen";

// The download helper touches Blob/object URLs/anchor clicks — mocked so the
// screen test asserts WHAT would be exported, not browser plumbing (the
// serialization itself is covered by review-csv.test.ts).
vi.mock("@/lib/review-csv", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/review-csv")>()),
  downloadCsv: vi.fn(),
}));

const doc = (id: string): DocumentMeta => ({
  id,
  filename: `${id}.pdf`,
  title: null,
  mimeType: "application/pdf",
  tokenCount: 5000,
  tokenCountEstimated: false,
  createdAt: new Date(),
});

/** Test harness: selects the given doc ids once on mount (the sidebar's job). */
function SelectDocs({ ids }: { ids: string[] }) {
  const { toggle } = useDocs();
  const applied = useRef(false);
  useEffect(() => {
    if (applied.current) return;
    applied.current = true;
    ids.forEach(toggle);
  }, [ids, toggle]);
  return null;
}

function renderScreen(documents: DocumentMeta[], selected: string[] = []) {
  return render(
    <DocsProvider documents={documents}>
      <SelectDocs ids={selected} />
      <ReviewScreen
        modelOptions={[
          { id: "claude-sonnet-4-6", label: "SONNET 4.6" },
          { id: "claude-haiku-5-5", label: "HAIKU 5.5" },
        ]}
        defaultModelId="claude-sonnet-4-6"
      />
    </DocsProvider>,
  );
}

function cellResponse(value: string) {
  return Response.json({
    answer: { value, citations: [], confidence: 0.95 },
    usage: {
      uncachedInputTokens: 100,
      cacheReadInputTokens: 0,
      cacheWriteInputTokens: 0,
      outputTokens: 10,
    },
  });
}

beforeEach(() => {
  window.localStorage.clear();
  vi.unstubAllGlobals();
});

describe("ReviewScreen", () => {
  it("hydrates saved settings without overwriting them or resetting edits on a parent render", () => {
    const storedColumns = [{ id: "mine", title: "Cap on liability", prompt: "What is the cap?", width: 200 }];
    window.localStorage.setItem(COLUMNS_STORAGE_KEY, JSON.stringify(storedColumns));
    window.localStorage.setItem(MODEL_STORAGE_KEY, "claude-haiku-5-5");
    const write = vi.spyOn(Storage.prototype, "setItem");
    const recover = vi.fn();
    // Fresh arrays mirror server props being reconstructed on router refresh.
    const tree = () => (
      <DocsProvider documents={[]}>
        <ReviewScreen
          modelOptions={[
            { id: "claude-sonnet-4-6", label: "SONNET 4.6" },
            { id: "claude-haiku-5-5", label: "HAIKU 5.5" },
          ]}
          defaultModelId="claude-sonnet-4-6"
        />
      </DocsProvider>
    );
    const container = document.createElement("div");
    document.body.appendChild(container);
    container.innerHTML = renderToString(tree());
    expect(container.textContent).toContain("Governing law");
    expect(container.textContent).not.toContain("Cap on liability");
    expect(write).not.toHaveBeenCalled();

    const view = render(tree(), { container, hydrate: true, onRecoverableError: recover });
    expect(view.getByText("Cap on liability")).toBeInTheDocument();
    expect(view.getByRole("combobox", { name: "Review model" })).toHaveValue("claude-haiku-5-5");
    expect(recover).not.toHaveBeenCalled();
    expect(write.mock.calls.filter(([key]) => key === COLUMNS_STORAGE_KEY)).toEqual([
      [COLUMNS_STORAGE_KEY, JSON.stringify(storedColumns)],
    ]);

    fireEvent.click(view.getByText("Cap on liability"));
    fireEvent.change(view.getByLabelText(/Column title/), { target: { value: "Edited cap" } });
    view.rerender(tree());
    expect(view.getByLabelText(/Column title/)).toHaveValue("Edited cap");
    expect(view.getByRole("combobox", { name: "Review model" })).toHaveValue("claude-haiku-5-5");
    write.mockRestore();
  });

  it("seeds the six starter columns and shows the empty-rows hint with no selection", () => {
    renderScreen([doc("d1")]);
    for (const col of STARTER_COLUMNS) {
      expect(screen.getByText(col.title)).toBeInTheDocument();
    }
    expect(screen.getByText(/Select documents in the sidebar/)).toBeInTheDocument();
    expect(screen.getByText("0 rows × 6 columns · 0 cells")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Run all/ })).toBeDisabled();
  });

  it("renders one row per selected document with idle cells", () => {
    renderScreen([doc("d1"), doc("d2"), doc("d3")], ["d1", "d2"]);
    expect(screen.getByText("d1.pdf")).toBeInTheDocument();
    expect(screen.getByText("d2.pdf")).toBeInTheDocument();
    expect(screen.queryByText("d3.pdf")).not.toBeInTheDocument();
    expect(screen.getByText("2 rows × 6 columns · 12 cells")).toBeInTheDocument();
    expect(screen.getAllByText("—")).toHaveLength(12);
    expect(screen.getByRole("button", { name: /Run all/ })).toBeEnabled();
    // The handoff's "Add documents" affordance points at the sidebar.
    expect(screen.getByText(/Add documents — select them in the sidebar/)).toBeInTheDocument();
  });

  it("closes an open column editor when Run all starts", async () => {
    vi.stubGlobal("fetch", vi.fn().mockImplementation(async () => cellResponse("ok")));
    renderScreen([doc("d1")], ["d1"]);

    fireEvent.click(screen.getByText("Governing law"));
    expect(screen.getByLabelText(/Column title/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Run all/ }));
    // Editor is gone immediately and cannot desync the run's bookkeeping.
    expect(screen.queryByLabelText(/Column title/)).not.toBeInTheDocument();
    await waitFor(() => expect(screen.getByText("6/6 complete")).toBeInTheDocument());
  });

  it("runs every cell on Run all and renders the results", async () => {
    const fetchMock = vi.fn().mockImplementation(async () => cellResponse("Delaware"));
    vi.stubGlobal("fetch", fetchMock);
    renderScreen([doc("d1"), doc("d2")], ["d1", "d2"]);

    fireEvent.click(screen.getByRole("button", { name: /Run all/ }));

    await waitFor(() => expect(screen.getByText("12/12 complete")).toBeInTheDocument());
    expect(fetchMock).toHaveBeenCalledTimes(12);
    expect(screen.getAllByText("Delaware")).toHaveLength(12);
    expect(screen.getByText("12 done")).toBeInTheDocument();
    // Cost pill appears in the header once at least one done cell exists.
    expect(screen.getByText(/^\$/)).toBeInTheDocument();
  });

  it("shows error cells when a call fails and keeps Run all re-armed", async () => {
    // Every call against d1 fails at the warm-up cell; d2 succeeds.
    const fetchMock = vi.fn().mockImplementation(async (_url, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as { docId: string };
      return body.docId === "d1"
        ? Response.json({ error: "Rate limited by the model API — retry shortly." }, { status: 429 })
        : cellResponse("Mutual");
    });
    vi.stubGlobal("fetch", fetchMock);
    renderScreen([doc("d1"), doc("d2")], ["d1", "d2"]);

    fireEvent.click(screen.getByRole("button", { name: /Run all/ }));

    await waitFor(() => expect(screen.getByText("6 error")).toBeInTheDocument());
    // d1: 1 warm-up failure + 5 skipped; d2: 6 successes; only 7 actual calls.
    expect(fetchMock).toHaveBeenCalledTimes(7);
    // All six of the doc's cells name the real reason: the warm cell directly,
    // the five skipped cells via the threaded warm-failure message.
    expect(screen.getAllByText(/Rate limited/)).toHaveLength(6);
    expect(screen.getAllByText(/cache warm-up/)).toHaveLength(5);
    expect(screen.getByRole("button", { name: /Run all/ })).toBeEnabled();
  });

  it("opens the column editor, saves edits to localStorage, and deletes columns", async () => {
    renderScreen([doc("d1")]);

    fireEvent.click(screen.getByText("Governing law"));
    const title = screen.getByLabelText(/Column title/);
    fireEvent.change(title, { target: { value: "Choice of law" } });

    await waitFor(() => {
      const stored = JSON.parse(window.localStorage.getItem(COLUMNS_STORAGE_KEY)!);
      expect(stored[0].title).toBe("Choice of law");
    });

    fireEvent.click(screen.getByRole("button", { name: /Delete/ }));
    expect(screen.queryByText("Choice of law")).not.toBeInTheDocument();
    expect(screen.getByText("0 rows × 5 columns · 0 cells")).toBeInTheDocument();
  });

  it("adds a new column and opens its editor", () => {
    renderScreen([doc("d1")]);
    fireEvent.click(screen.getByRole("button", { name: /Add column/ }));
    expect(screen.getByText("0 rows × 7 columns · 0 cells")).toBeInTheDocument();
    expect(screen.getByLabelText(/Column title/)).toBeInTheDocument();
    expect(screen.getByText(/No prompt yet/)).toBeInTheDocument();
  });

  it("disables CSV with no rows; exports the current grid state when clicked", async () => {
    const fetchMock = vi.fn().mockImplementation(async () => cellResponse("Delaware"));
    vi.stubGlobal("fetch", fetchMock);
    const { unmount } = renderScreen([doc("d1")]);
    expect(screen.getByRole("button", { name: /CSV/ })).toBeDisabled();
    unmount();

    renderScreen([doc("d1")], ["d1"]);
    fireEvent.click(screen.getByRole("button", { name: /Run all/ }));
    await waitFor(() => expect(screen.getByText("6/6 complete")).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: /CSV/ }));
    expect(downloadCsv).toHaveBeenCalledTimes(1);
    const [csv, filename] = vi.mocked(downloadCsv).mock.calls[0];
    expect(filename).toMatch(/^review-grid-\d{4}-\d{2}-\d{2}\.csv$/);
    const lines = csv.split("\r\n");
    expect(lines[0]).toContain("Governing law · confidence");
    expect(lines[1]).toContain("d1.pdf");
    expect(lines[1]).toContain("Delaware");
  });

  it("loads previously stored columns instead of the starters", async () => {
    window.localStorage.setItem(
      COLUMNS_STORAGE_KEY,
      JSON.stringify([{ id: "mine", title: "Cap on liability", prompt: "What is the cap?", width: 200 }]),
    );
    renderScreen([doc("d1")]);
    await waitFor(() => expect(screen.getByText("Cap on liability")).toBeInTheDocument());
    expect(screen.queryByText("Governing law")).not.toBeInTheDocument();
  });
});

describe("ReviewScreen — inspector", () => {
  it("opens the inspector when a done cell is clicked and follows selection", async () => {
    const fetchMock = vi.fn().mockImplementation(async () => cellResponse("Delaware"));
    vi.stubGlobal("fetch", fetchMock);
    renderScreen([doc("d1")], ["d1"]);

    fireEvent.click(screen.getByRole("button", { name: /Run all/ }));
    await waitFor(() => expect(screen.getByText("6/6 complete")).toBeInTheDocument());

    // Click the first done cell (a button whose text contains the value).
    const cells = screen.getAllByRole("button", { name: /Delaware/ });
    fireEvent.click(cells[0]);

    // The inspector shows the Regenerate action and the column's full prompt.
    // The prompt text also appears in the column header preview, so use
    // getAllByText and assert at least one match.
    expect(screen.getByRole("button", { name: /Regenerate/ })).toBeInTheDocument();
    expect(
      screen.getAllByText(/What is the governing law clause/).length,
    ).toBeGreaterThan(0);
  });

  it("regenerates the selected cell in place", async () => {
    let call = 0;
    const fetchMock = vi.fn().mockImplementation(async () => {
      call += 1;
      return cellResponse(call <= 6 ? "Delaware" : "New York");
    });
    vi.stubGlobal("fetch", fetchMock);
    renderScreen([doc("d1")], ["d1"]);

    fireEvent.click(screen.getByRole("button", { name: /Run all/ }));
    await waitFor(() => expect(screen.getByText("6/6 complete")).toBeInTheDocument());

    fireEvent.click(screen.getAllByRole("button", { name: /Delaware/ })[0]);
    fireEvent.click(screen.getByRole("button", { name: /Regenerate/ }));

    // "New York" appears in the cell and also in the open inspector — use
    // getAllByText to avoid the multiple-match error.
    await waitFor(() => expect(screen.getAllByText("New York").length).toBeGreaterThan(0));
  });

  it("closes the inspector when the selected column is deleted", async () => {
    const fetchMock = vi.fn().mockImplementation(async () => cellResponse("Delaware"));
    vi.stubGlobal("fetch", fetchMock);
    renderScreen([doc("d1")], ["d1"]);

    fireEvent.click(screen.getByRole("button", { name: /Run all/ }));
    await waitFor(() => expect(screen.getByText("6/6 complete")).toBeInTheDocument());

    fireEvent.click(screen.getAllByRole("button", { name: /Delaware/ })[0]);
    expect(screen.getByRole("button", { name: /Regenerate/ })).toBeInTheDocument();

    // Open the first column's editor and delete it.
    // "Governing law" appears twice (column header + inspector header); click
    // the first occurrence, which is the column header's toggle button.
    fireEvent.click(screen.getAllByText("Governing law")[0]);
    fireEvent.click(screen.getByRole("button", { name: /Delete/ }));

    expect(screen.queryByRole("button", { name: /Regenerate/ })).not.toBeInTheDocument();
  });
});
