// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { VerifiedAnswer } from "@/lib/contract";
import type { CellResult, CellUsage, ReviewColumn } from "@/lib/review-grid";
import { GridCell } from "./grid-cell";

const col: ReviewColumn = { id: "c1", title: "Governing law", prompt: "p", width: 160 };

const usage: CellUsage = {
  inputTokens: 100,
  outputTokens: 20,
  cacheReadInputTokens: 0,
  cacheCreationInputTokens: 0,
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
});
