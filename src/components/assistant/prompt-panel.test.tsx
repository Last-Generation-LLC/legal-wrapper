// @vitest-environment jsdom
import { useState } from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DEFAULT_SYSTEM_PROMPT, DOCUMENTS_TOKEN } from "@/lib/wrapper";
import { effectiveTemplate } from "@/lib/chat-ui";
import { PromptPanel } from "./prompt-panel";

/** Stateful harness standing in for assistant-chat's template ownership. */
function Harness({ initial = DEFAULT_SYSTEM_PROMPT }: { initial?: string }) {
  const [value, setValue] = useState(initial);
  return (
    <PromptPanel value={value} onChange={setValue} onReset={() => setValue(DEFAULT_SYSTEM_PROMPT)} />
  );
}

describe("PromptPanel", () => {
  it("shows the template with live char count and token estimate", () => {
    render(<Harness />);
    const textarea = screen.getByLabelText("System prompt template") as HTMLTextAreaElement;
    expect(textarea.value).toBe(DEFAULT_SYSTEM_PROMPT);
    const chars = DEFAULT_SYSTEM_PROMPT.length.toLocaleString();
    const toks = Math.round(DEFAULT_SYSTEM_PROMPT.length / 4).toLocaleString();
    expect(screen.getByText(`${chars} chars · ~${toks} tok`)).toBeInTheDocument();

    fireEvent.change(textarea, { target: { value: "abcd" } });
    expect(screen.getByText("4 chars · ~1 tok")).toBeInTheDocument();
  });

  it("explains the {{DOCUMENTS}} replacement in the footer note", () => {
    render(<Harness />);
    const token = DOCUMENTS_TOKEN.replace(/[{}]/g, "\\$&");
    expect(
      screen.getByText(new RegExp(`${token}.*nothing\\s+is hidden from you`)),
    ).toBeInTheDocument();
    // No warnings while the token is present and the template is non-blank.
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("shows the fixed strategy appendix read-only — the honesty claim's other half", () => {
    render(<Harness />);
    // The appendix is rendered verbatim (in a <pre>, not the editable textarea).
    expect(screen.getByText(/Citations and confidence/)).toBeInTheDocument();
    expect(screen.getByText(/Appended after your template/)).toBeInTheDocument();
    const textarea = screen.getByLabelText("System prompt template") as HTMLTextAreaElement;
    expect(textarea.value).not.toContain("Citations and confidence");
  });

  it("warns when the token is removed, and that warning resolves on Reset", () => {
    render(<Harness />);
    const textarea = screen.getByLabelText("System prompt template");
    fireEvent.change(textarea, { target: { value: "You are terse. Answer in one line." } });
    expect(screen.getByRole("alert").textContent).toMatch(/appended at the end/);

    fireEvent.click(screen.getByRole("button", { name: /Reset/ }));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect((textarea as HTMLTextAreaElement).value).toBe(DEFAULT_SYSTEM_PROMPT);
  });

  it("notes the default-fallback when the template is blank", () => {
    render(<Harness initial="   " />);
    expect(screen.getByRole("alert").textContent).toMatch(/default prompt will be sent/);
  });

  it("copies the current template to the clipboard", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { ...navigator, clipboard: { writeText } });
    render(<Harness />);

    fireEvent.click(screen.getByRole("button", { name: /Copy/ }));
    expect(writeText).toHaveBeenCalledWith(DEFAULT_SYSTEM_PROMPT);
    await waitFor(() => expect(screen.getByText("Copied")).toBeInTheDocument());
  });
});

describe("effectiveTemplate", () => {
  it("sends the user's edit verbatim when non-blank", () => {
    expect(effectiveTemplate("custom prompt", DEFAULT_SYSTEM_PROMPT)).toBe("custom prompt");
  });

  it.each(["", "   ", "\n\t "])("falls back to the default for blank %j", (blank) => {
    expect(effectiveTemplate(blank, DEFAULT_SYSTEM_PROMPT)).toBe(DEFAULT_SYSTEM_PROMPT);
  });
});
