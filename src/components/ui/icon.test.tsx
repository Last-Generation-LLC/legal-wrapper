// @vitest-environment jsdom
import { render } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { Icon } from "./icon";

describe("Icon", () => {
  it("renders an svg for a mapped name", () => {
    const { container } = render(<Icon name="chat" />);
    expect(container.querySelector("svg")).toBeInTheDocument();
  });

  it("applies the requested size", () => {
    const { container } = render(<Icon name="grid" size={20} />);
    const svg = container.querySelector("svg")!;
    expect(svg).toHaveAttribute("width", "20");
  });
});
