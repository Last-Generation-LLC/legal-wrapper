// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";

vi.mock("next/navigation", () => ({ usePathname: () => "/review" }));

import { Rail } from "./rail";

describe("Rail", () => {
  it("marks the active section based on the pathname", () => {
    render(<Rail />);
    // The Review link is active → carries the panel-hi background class.
    const review = screen.getByRole("link", { name: /review/i });
    expect(review).toHaveClass("bg-panel-hi");
    const assistant = screen.getByRole("link", { name: /assistant/i });
    expect(assistant).not.toHaveClass("bg-panel-hi");
  });

  it("links to the three workspace routes", () => {
    render(<Rail />);
    expect(screen.getByRole("link", { name: /assistant/i })).toHaveAttribute("href", "/assistant");
    expect(screen.getByRole("link", { name: /review/i })).toHaveAttribute("href", "/review");
    expect(screen.getByRole("link", { name: /documents/i })).toHaveAttribute("href", "/documents");
  });
});
