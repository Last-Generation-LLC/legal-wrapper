// @vitest-environment jsdom
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { VerifiedAnswer } from "@/lib/contract";
import type { CellResult, CellUsage, ReviewColumn } from "@/lib/review-grid";
import { GridCell } from "./grid-cell";

const col: ReviewColumn = { id: "c1", title: "Governing law", prompt: "p", width: 160 };

const usage: CellUsage = {
  uncachedInputTokens: 100,
  cacheReadInputTokens: 0,
  cacheWriteInputTokens: 0,
  outputTokens: 20,
};

function done(answer: Partial<VerifiedAnswer>): CellResult {
  return {
    status: "done",
    answer: { value: "Delaware", citations: [], confidence: 0.97, ...answer },
    usage,
    promptUsed: "p",
  };
}

describe("GridCell", () => {
  it("renders an em-dash for idle (absent) cells", () => {
    render(<GridCell cell={undefined} col={col} />);
    expect(screen.getByText("—")).toBeInTheDocument();
  });

  it("renders the running state", () => {
    render(<GridCell cell={{ status: "running" }} col={col} />);
    expect(screen.getByText("running")).toBeInTheDocument();
  });

  it("renders the error state with its message", () => {
    render(<GridCell cell={{ status: "error", message: "prompt is too long" }} col={col} />);
    expect(screen.getByText("error")).toBeInTheDocument();
    expect(screen.getByText("prompt is too long")).toBeInTheDocument();
  });

  it("renders a done cell: value, confidence dot, citation tag", () => {
    render(
      <GridCell
        cell={done({
          citations: [
            { docId: "d", quote: "the quote here", section: "§14.1", page: 6, verified: true },
          ],
        })}
        col={col}
      />,
    );
    expect(screen.getByText("Delaware")).toBeInTheDocument();
    expect(screen.getByTitle("Document-support confidence")).toBeInTheDocument();
    expect(screen.getByText("p.6 · §14.1")).toBeInTheDocument();
  });

  it("flags unverified citations in the tag", () => {
    render(
      <GridCell
        cell={done({
          citations: [{ docId: "d", quote: "the quote here", section: "§3", verified: false }],
        })}
        col={col}
      />,
    );
    expect(screen.getByText("§3 · unverified")).toBeInTheDocument();
  });

  it("renders numeric columns in mono", () => {
    render(<GridCell cell={done({ value: "3" })} col={{ ...col, numeric: true }} />);
    expect(screen.getByText("3").className).toContain("font-mono");
  });

  it("fires onSelect when a done cell is clicked", () => {
    const onSelect = vi.fn();
    render(<GridCell cell={done({})} col={col} onSelect={onSelect} />);
    fireEvent.click(screen.getByRole("button"));
    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  it("carries the selection outline when selected", () => {
    render(<GridCell cell={done({})} col={col} selected onSelect={() => {}} />);
    expect(screen.getByRole("button").className).toContain("outline-amber");
  });

  it("does not render a button for non-done cells", () => {
    render(<GridCell cell={{ status: "running" }} col={col} onSelect={() => {}} />);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});
