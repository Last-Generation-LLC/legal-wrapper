// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { TopBar } from "./top-bar";

describe("TopBar", () => {
  it("renders each breadcrumb", () => {
    render(<TopBar crumbs={["~/workspaces", "Aperture", "Assistant"]} />);
    expect(screen.getByText("Aperture")).toBeInTheDocument();
    expect(screen.getByText("Assistant")).toBeInTheDocument();
  });

  it("renders the right slot", () => {
    render(<TopBar crumbs={["x"]} right={<button>Run all</button>} />);
    expect(screen.getByRole("button", { name: "Run all" })).toBeInTheDocument();
  });
});
