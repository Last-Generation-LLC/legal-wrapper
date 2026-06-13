// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { StatusBar } from "./status-bar";

const counts = { total: 6, done: 3, running: 0, error: 0 };

describe("StatusBar cost/cache", () => {
  it("shows cost and cache pills when provided", () => {
    render(<StatusBar rows={2} columns={3} counts={counts} cost="$0.0123" cachePct="42%" />);
    expect(screen.getByText("$0.0123")).toBeInTheDocument();
    expect(screen.getByText(/cache · 42%/)).toBeInTheDocument();
  });

  it("omits the cost/cache pills when not provided", () => {
    render(<StatusBar rows={2} columns={3} counts={counts} />);
    expect(screen.queryByText(/cache ·/)).not.toBeInTheDocument();
  });
});
