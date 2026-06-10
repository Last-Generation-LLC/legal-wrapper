// @vitest-environment jsdom
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import type { DocumentMeta } from "@/lib/documents";
import { DocRow } from "./doc-row";

const doc: DocumentMeta = {
  id: "d1", filename: "Aperture_MSA_v4.pdf", title: null,
  mimeType: "application/pdf", tokenCount: 31420,
  tokenCountEstimated: false, createdAt: new Date(),
};

describe("DocRow", () => {
  it("renders the label and FORMAT · tokens metadata", () => {
    render(<DocRow doc={doc} selected={false} onToggle={() => {}} />);
    expect(screen.getByText("Aperture_MSA_v4.pdf")).toBeInTheDocument();
    expect(screen.getByText("PDF")).toBeInTheDocument();
    expect(screen.getByText("31.4k tok")).toBeInTheDocument();
  });

  it("reflects selected state via aria-pressed and the panel-hi background", () => {
    render(<DocRow doc={doc} selected={true} onToggle={() => {}} />);
    const row = screen.getByRole("button");
    expect(row).toHaveAttribute("aria-pressed", "true");
    expect(row).toHaveClass("bg-panel-hi");
  });

  it("calls onToggle when clicked", () => {
    const onToggle = vi.fn();
    render(<DocRow doc={doc} selected={false} onToggle={onToggle} />);
    fireEvent.click(screen.getByRole("button"));
    expect(onToggle).toHaveBeenCalledOnce();
  });
});
