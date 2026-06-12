// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import type { DocumentMeta } from "@/lib/documents";
import { ContextStrip } from "./context-strip";

function doc(id: string, filename: string, title: string | null = null): DocumentMeta {
  return {
    id,
    filename,
    title,
    mimeType: "application/pdf",
    tokenCount: 1000,
    tokenCountEstimated: false,
    createdAt: new Date(),
  };
}

describe("ContextStrip", () => {
  it("renders one blue pill per selected document", () => {
    render(<ContextStrip docs={[doc("d1", "msa.pdf"), doc("d2", "dpa.pdf", "DPA 2025")]} />);
    expect(screen.getByText("msa.pdf")).toHaveClass("text-blue");
    // titled docs display their title, not the filename
    expect(screen.getByText("DPA 2025")).toBeInTheDocument();
    expect(screen.queryByText("dpa.pdf")).not.toBeInTheDocument();
  });

  it("shows a dim hint when nothing is selected", () => {
    render(<ContextStrip docs={[]} />);
    expect(screen.getByText(/no documents selected/i)).toBeInTheDocument();
  });
});
