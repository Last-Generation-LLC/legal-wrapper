import { describe, expect, it } from "vitest";
import {
  CEILING_WARN_FRACTION,
  ceilingState,
  CONTEXT_CEILING,
  docOverCeilingMessage,
  overCeilingMessage,
} from "./context-ceiling";

describe("ceilingState", () => {
  it.each([
    [0, "ok"],
    [CONTEXT_CEILING * CEILING_WARN_FRACTION - 1, "ok"],
    [CONTEXT_CEILING * CEILING_WARN_FRACTION, "warn"], // 144k: warn starts AT the fraction
    [CONTEXT_CEILING, "warn"], // exactly at the ceiling is still sendable
    [CONTEXT_CEILING + 1, "over"],
  ])("%i tokens → %s", (tokens, expected) => {
    expect(ceilingState(tokens)).toBe(expected);
  });
});

describe("messages", () => {
  it("names the actual total and the ceiling", () => {
    const msg = overCeilingMessage(212_400);
    expect(msg).toContain("212.4k");
    expect(msg).toContain("180.0k");
    expect(msg).toMatch(/Deselect/);
  });

  it("the per-document variant names the document's size", () => {
    const msg = docOverCeilingMessage(199_900);
    expect(msg).toContain("199.9k");
    expect(msg).toMatch(/cannot be reviewed/);
  });
});
