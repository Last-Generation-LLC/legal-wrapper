// @vitest-environment jsdom
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { EmptyState } from "./empty-state";

describe("EmptyState", () => {
  it("renders the heading and hint", () => {
    render(<EmptyState icon="doc" heading="No documents yet" hint="Upload a PDF or DOCX." />);
    expect(screen.getByText("No documents yet")).toBeInTheDocument();
    expect(screen.getByText("Upload a PDF or DOCX.")).toBeInTheDocument();
  });

  it("renders no button when there is no action", () => {
    render(<EmptyState icon="doc" heading="h" hint="x" />);
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("fires the action handler when the CTA is clicked", () => {
    const onClick = vi.fn();
    render(
      <EmptyState
        icon="doc"
        heading="h"
        hint="x"
        action={{ label: "Upload", icon: "upload", onClick }}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /upload/i }));
    expect(onClick).toHaveBeenCalledOnce();
  });

  it("disables the CTA when the action is disabled", () => {
    render(
      <EmptyState
        icon="doc"
        heading="h"
        hint="x"
        action={{ label: "Uploading…", onClick: () => {}, disabled: true }}
      />,
    );
    expect(screen.getByRole("button", { name: /uploading/i })).toBeDisabled();
  });
});
