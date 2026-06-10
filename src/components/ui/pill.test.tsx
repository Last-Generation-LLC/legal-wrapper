// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { Pill } from "./pill";

describe("Pill", () => {
  it("renders children", () => {
    render(<Pill>OPUS 4.8</Pill>);
    expect(screen.getByText("OPUS 4.8")).toBeInTheDocument();
  });

  it("ctx tone uses the blue text token", () => {
    render(<Pill tone="ctx">ctx</Pill>);
    expect(screen.getByText("ctx")).toHaveClass("text-blue");
  });

  it("ok tone uses the green text token", () => {
    render(<Pill tone="ok">done</Pill>);
    expect(screen.getByText("done")).toHaveClass("text-green");
  });
});
