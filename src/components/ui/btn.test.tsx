// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { Btn } from "./btn";

describe("Btn", () => {
  it("renders its children", () => {
    render(<Btn>Send</Btn>);
    expect(screen.getByRole("button", { name: "Send" })).toBeInTheDocument();
  });

  it("primary variant uses the primary token classes", () => {
    render(<Btn variant="primary">Run</Btn>);
    expect(screen.getByRole("button", { name: "Run" })).toHaveClass("bg-primary");
  });

  it("sm size sets the short height", () => {
    render(<Btn size="sm">x</Btn>);
    expect(screen.getByRole("button")).toHaveClass("h-6");
  });

  it("renders a leading icon when given one", () => {
    const { container } = render(<Btn icon="plus">Add</Btn>);
    expect(container.querySelector("svg")).toBeInTheDocument();
  });
});
