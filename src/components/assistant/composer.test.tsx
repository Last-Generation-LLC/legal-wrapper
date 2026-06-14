// @vitest-environment jsdom
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { Composer } from "./composer";

function renderComposer(props: Partial<React.ComponentProps<typeof Composer>> = {}) {
  const defaults: React.ComponentProps<typeof Composer> = {
    value: "",
    onChange: () => {},
    onSend: () => {},
    onAttach: () => {},
    onCancelEdit: () => {},
    busy: false,
    blocked: null,
    uploading: false,
    docCount: 2,
    editing: false,
  };
  return render(<Composer {...defaults} {...props} />);
}

describe("Composer", () => {
  it("shows the mono hint with the attached-doc count", () => {
    renderComposer({ docCount: 3 });
    expect(screen.getByText("⌘↵ to send · 3 docs attached")).toBeInTheDocument();
  });

  it("sends on ⌘↵ and on Ctrl+Enter", () => {
    const onSend = vi.fn();
    renderComposer({ value: "question", onSend });
    const textarea = screen.getByPlaceholderText(/ask a legal question/i);
    fireEvent.keyDown(textarea, { key: "Enter", metaKey: true });
    fireEvent.keyDown(textarea, { key: "Enter", ctrlKey: true });
    expect(onSend).toHaveBeenCalledTimes(2);
  });

  it("blocks sending past the ceiling and shows the reason (#16)", () => {
    const onSend = vi.fn();
    renderComposer({
      value: "a real question",
      onSend,
      blocked: "Selected documents total ~212.4k tokens — over the 180.0k context ceiling.",
    });
    expect(screen.getByRole("alert").textContent).toMatch(/over the 180\.0k/);
    expect(screen.getByRole("button", { name: /Send/ })).toBeDisabled();
    fireEvent.keyDown(screen.getByPlaceholderText(/ask a legal question/i), { key: "Enter", metaKey: true });
    expect(onSend).not.toHaveBeenCalled();
  });

  it("does not send a blank message", () => {
    const onSend = vi.fn();
    renderComposer({ value: "   ", onSend });
    fireEvent.keyDown(screen.getByPlaceholderText(/ask a legal question/i), { key: "Enter", metaKey: true });
    expect(screen.getByRole("button", { name: /send/i })).toBeDisabled();
    expect(onSend).not.toHaveBeenCalled();
  });

  it("sends via the Send button", () => {
    const onSend = vi.fn();
    renderComposer({ value: "question", onSend });
    fireEvent.click(screen.getByRole("button", { name: /send/i }));
    expect(onSend).toHaveBeenCalledOnce();
  });

  it("disables Send while a call is in flight", () => {
    renderComposer({ value: "question", busy: true });
    expect(screen.getByRole("button", { name: /send/i })).toBeDisabled();
  });

  it("shows the editing pill and cancels edit on Escape", () => {
    const onCancelEdit = vi.fn();
    renderComposer({ editing: true, value: "edited", onCancelEdit });
    expect(screen.getByText(/editing/i)).toBeInTheDocument();
    fireEvent.keyDown(screen.getByPlaceholderText(/ask a legal question/i), { key: "Escape" });
    expect(onCancelEdit).toHaveBeenCalledOnce();
  });

  it("forwards a picked file to onAttach", () => {
    const onAttach = vi.fn();
    renderComposer({ onAttach });
    const input = screen.getByTestId("attach-input") as HTMLInputElement;
    const file = new File(["%PDF"], "new.pdf", { type: "application/pdf" });
    fireEvent.change(input, { target: { files: [file] } });
    expect(onAttach).toHaveBeenCalledWith(file);
  });
});
