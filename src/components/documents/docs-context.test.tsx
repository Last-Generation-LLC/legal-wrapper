// @vitest-environment jsdom
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import type { DocumentMeta } from "@/lib/documents";
import { DocsProvider, useDocs } from "./docs-context";

const doc = (id: string, tokenCount: number): DocumentMeta => ({
  id, filename: `${id}.pdf`, title: null, mimeType: "application/pdf",
  tokenCount, tokenCountEstimated: false, createdAt: new Date(),
});

function Probe() {
  const { selectedCount, selectedTokens, totalCount, totalTokens, toggle, ceiling } = useDocs();
  return (
    <div>
      <span data-testid="sel-count">{selectedCount}</span>
      <span data-testid="sel-tokens">{selectedTokens}</span>
      <span data-testid="total-count">{totalCount}</span>
      <span data-testid="total-tokens">{totalTokens}</span>
      <span data-testid="ceiling">{ceiling}</span>
      <button onClick={() => toggle("a")}>toggle-a</button>
    </div>
  );
}

describe("DocsProvider seeding (#22)", () => {
  it("starts with the restored session selection", () => {
    render(
      <DocsProvider documents={[doc("a", 100), doc("b", 200), doc("c", 300)]} initialSelectedIds={["a", "c"]}>
        <Probe />
      </DocsProvider>,
    );
    expect(screen.getByTestId("sel-count").textContent).toBe("2");
    expect(screen.getByTestId("sel-tokens").textContent).toBe("400");
  });
});

describe("DocsProvider", () => {
  it("derives totals over all docs and selection over selected docs", () => {
    render(
      <DocsProvider documents={[doc("a", 1000), doc("b", 2000)]}>
        <Probe />
      </DocsProvider>,
    );
    // Nothing selected yet.
    expect(screen.getByTestId("sel-count").textContent).toBe("0");
    expect(screen.getByTestId("sel-tokens").textContent).toBe("0");
    expect(screen.getByTestId("total-count").textContent).toBe("2");
    expect(screen.getByTestId("total-tokens").textContent).toBe("3000");
    expect(screen.getByTestId("ceiling").textContent).toBe("180000");

    // Select doc "a".
    fireEvent.click(screen.getByText("toggle-a"));
    expect(screen.getByTestId("sel-count").textContent).toBe("1");
    expect(screen.getByTestId("sel-tokens").textContent).toBe("1000");

    // Toggling again deselects.
    fireEvent.click(screen.getByText("toggle-a"));
    expect(screen.getByTestId("sel-count").textContent).toBe("0");
  });

  it("throws if useDocs is called outside a provider", () => {
    function Bare() {
      useDocs();
      return null;
    }
    expect(() => render(<Bare />)).toThrow(/useDocs must be used within a DocsProvider/);
  });
});
