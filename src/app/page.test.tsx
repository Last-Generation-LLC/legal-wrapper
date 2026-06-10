// @vitest-environment node
import { describe, it, expect, vi } from "vitest";

const redirect = vi.fn();
vi.mock("next/navigation", () => ({ redirect: (...a: unknown[]) => redirect(...a) }));

import Home from "./page";

describe("root route", () => {
  it("redirects to /assistant", () => {
    Home();
    expect(redirect).toHaveBeenCalledWith("/assistant");
  });
});
