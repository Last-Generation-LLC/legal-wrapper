// @vitest-environment jsdom
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { DocumentMeta } from "@/lib/documents";
import type { CellResult, CellUsage, ReviewColumn } from "@/lib/review-grid";
import type { VerifiedAnswer } from "@/lib/contract";
import { CellInspector } from "./cell-inspector";

const doc: DocumentMeta = {
  id: "d1",
  filename: "acme-nda.pdf",
  title: null,
  mimeType: "application/pdf",
  tokenCount: 5000,
  tokenCountEstimated: false,
  createdAt: new Date(),
};

const col: ReviewColumn = {
  id: "c1",
  title: "Governing law",
  prompt: "What is the governing law clause?",
  width: 160,
};

const usage: CellUsage = {
  inputTokens: 100,
  outputTokens: 20,
  cacheReadInputTokens: 0,
  cacheCreationInputTokens: 0,
};

const answer: VerifiedAnswer = {
  value: "Delaware",
  confidence: 0.97,
  citations: [{ docId: "d1", quote: "governed by the laws of Delaware", section: "§14.1", page: 6, verified: true }],
};

const doneCell: CellResult = { status: "done", answer, usage, promptUsed: col.prompt };

function renderInspector(cell: CellResult, overrides: Partial<Parameters<typeof CellInspector>[0]> = {}) {
  return render(
    <CellInspector
      doc={doc}
      col={col}
      cell={cell}
      documents={[doc]}
      busy={false}
      onRegenerate={vi.fn()}
      onEditPrompt={vi.fn()}
      onClose={vi.fn()}
      {...overrides}
    />,
  );
}

describe("CellInspector", () => {
  it("shows the full value, confidence, citation, and the column prompt", () => {
    renderInspector(doneCell);
    expect(screen.getByText("Delaware")).toBeInTheDocument();
    expect(screen.getByText("0.97")).toBeInTheDocument();
    expect(screen.getByText(/acme-nda §14.1 · p.6/)).toBeInTheDocument();
    expect(screen.getByText("governed by the laws of Delaware")).toBeInTheDocument();
    expect(screen.getByText("What is the governing law clause?")).toBeInTheDocument();
  });

  it("fires the action callbacks", () => {
    const onRegenerate = vi.fn();
    const onEditPrompt = vi.fn();
    const onClose = vi.fn();
    renderInspector(doneCell, { onRegenerate, onEditPrompt, onClose });
    fireEvent.click(screen.getByRole("button", { name: /Regenerate/ }));
    fireEvent.click(screen.getByRole("button", { name: /Edit prompt/ }));
    fireEvent.click(screen.getByRole("button", { name: /Close/ }));
    expect(onRegenerate).toHaveBeenCalledTimes(1);
    expect(onEditPrompt).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("disables Regenerate while busy and renders the running state", () => {
    renderInspector({ status: "running" }, { busy: true });
    expect(screen.getByRole("button", { name: /Regenerate/ })).toBeDisabled();
    expect(screen.getByText(/Regenerating/)).toBeInTheDocument();
  });

  it("renders the error message and keeps Regenerate enabled", () => {
    renderInspector({ status: "error", message: "Rate limited by the model API — retry shortly." });
    expect(screen.getByText(/Rate limited/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Regenerate/ })).toBeEnabled();
  });

  it("renders View source as a disabled stub", () => {
    renderInspector(doneCell);
    expect(screen.getByRole("button", { name: /View source/ })).toBeDisabled();
  });
});
