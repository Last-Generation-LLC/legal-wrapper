// @vitest-environment jsdom
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { DocumentMeta } from "@/lib/documents";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
vi.mock("sonner", () => ({ toast: { error: vi.fn() } }));

import { toast } from "sonner";
import { DocsProvider } from "./docs-context";
import { DocSidebar } from "./doc-sidebar";

const doc = (id: string, tokenCount: number): DocumentMeta => ({
  id, filename: `${id}.pdf`, title: null, mimeType: "application/pdf",
  tokenCount, tokenCountEstimated: false, createdAt: new Date(),
});

function renderSidebar(documents: DocumentMeta[]) {
  return render(
    <DocsProvider documents={documents}>
      <DocSidebar />
    </DocsProvider>,
  );
}

describe("DocSidebar", () => {
  beforeEach(() => {
    refresh.mockClear();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("shows the live header count/token total and an empty state with no docs", () => {
    renderSidebar([]);
    expect(screen.getByText("0 documents · 0 tokens")).toBeInTheDocument();
    expect(screen.getByText(/No documents yet/i)).toBeInTheDocument();
  });

  it("warns near the ceiling and flags red past it (#16)", () => {
    renderSidebar([doc("big", 150_000), doc("bigger", 50_000)]);
    fireEvent.click(screen.getByText("big.pdf"));
    expect(screen.getByText(/150\.0k \/ 180\.0k · near ceiling/)).toBeInTheDocument();
    fireEvent.click(screen.getByText("bigger.pdf"));
    expect(screen.getByText(/200\.0k \/ 180\.0k · over ceiling/)).toBeInTheDocument();
  });

  it("lists documents and updates the in-context count when a row is toggled", () => {
    renderSidebar([doc("a", 1000), doc("b", 2000)]);
    expect(screen.getByText("2 documents · 3,000 tokens")).toBeInTheDocument();
    expect(screen.getByText("In Context · 0")).toBeInTheDocument();
    fireEvent.click(screen.getByText("a.pdf"));
    expect(screen.getByText("In Context · 1")).toBeInTheDocument();
  });

  it("uploads the chosen file and refreshes on success", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 201, json: async () => ({ id: "x" }) });
    vi.stubGlobal("fetch", fetchMock);
    renderSidebar([]);

    const input = screen.getByTestId("upload-input") as HTMLInputElement;
    const file = new File(["%PDF-1.4"], "new.pdf", { type: "application/pdf" });
    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => expect(refresh).toHaveBeenCalledOnce());
    expect(fetchMock).toHaveBeenCalledWith("/api/upload", expect.objectContaining({ method: "POST" }));
  });

  it("toasts the API error message and does not refresh on failure (#18)", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false, status: 422, json: async () => ({ error: "Could not extract text from this PDF." }),
    });
    vi.stubGlobal("fetch", fetchMock);
    renderSidebar([]);

    const input = screen.getByTestId("upload-input") as HTMLInputElement;
    const file = new File(["bad"], "scan.pdf", { type: "application/pdf" });
    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith("Could not extract text from this PDF."),
    );
    expect(refresh).not.toHaveBeenCalled();
  });
});
