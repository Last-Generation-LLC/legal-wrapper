import { describe, it, expect } from "vitest";
import {
  DOCUMENTS_TOKEN,
  DEFAULT_SYSTEM_PROMPT,
  templateHasDocumentsToken,
} from "@/lib/wrapper";

describe("default prompt + token", () => {
  it("uses {{DOCUMENTS}} as the token", () => {
    expect(DOCUMENTS_TOKEN).toBe("{{DOCUMENTS}}");
  });

  it("ships the mock contract-review prompt containing the token", () => {
    expect(DEFAULT_SYSTEM_PROMPT).toContain(
      "You are a contract review assistant for an in-house legal team.",
    );
    expect(DEFAULT_SYSTEM_PROMPT).toContain(DOCUMENTS_TOKEN);
  });
});

describe("templateHasDocumentsToken", () => {
  it("detects the token's presence", () => {
    expect(templateHasDocumentsToken("a {{DOCUMENTS}} b")).toBe(true);
    expect(templateHasDocumentsToken("no token here")).toBe(false);
  });
});
