// @vitest-environment jsdom
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import type { AssistantUIMessage } from "@/lib/chat-ui";
import { MessageThread } from "./message-thread";

function renderThread(props: Partial<React.ComponentProps<typeof MessageThread>> = {}) {
  const defaults: React.ComponentProps<typeof MessageThread> = {
    messages: [],
    status: "ready",
    error: undefined,
    documents: [],
    onRegenerate: () => {},
    onEditPrompt: () => {},
    onRetry: () => {},
  };
  return render(<MessageThread {...defaults} {...props} />);
}

const THREAD: AssistantUIMessage[] = [
  { id: "u1", role: "user", parts: [{ type: "text", text: "What is the term?" }] },
  { id: "a1", role: "assistant", parts: [{ type: "text", text: "Five years." }] },
];

describe("MessageThread", () => {
  it("shows an empty-state hint before the first message", () => {
    renderThread();
    expect(screen.getByText(/select documents/i)).toBeInTheDocument();
  });

  it("renders the messages", () => {
    renderThread({ messages: THREAD });
    expect(screen.getByText("What is the term?")).toBeInTheDocument();
    expect(screen.getByText("Five years.")).toBeInTheDocument();
  });

  it("shows the drafting indicator with a live token estimate while streaming", () => {
    const streaming: AssistantUIMessage[] = [
      THREAD[0],
      { id: "a1", role: "assistant", parts: [{ type: "text", text: "x".repeat(400) }] },
    ];
    renderThread({ messages: streaming, status: "streaming" });
    expect(screen.getByText(/drafting · ~100 tok generated/)).toBeInTheDocument();
  });

  it("shows the drafting indicator without a count before tokens arrive", () => {
    renderThread({ messages: THREAD.slice(0, 1), status: "submitted" });
    expect(screen.getByText(/drafting…/)).toBeInTheDocument();
  });

  it("surfaces a stream error with a Retry action", () => {
    const onRetry = vi.fn();
    renderThread({
      messages: THREAD,
      status: "error",
      error: new Error("The selected documents exceed the model's context window."),
      onRetry,
    });
    expect(screen.getByRole("alert")).toHaveTextContent(/context window/);
    fireEvent.click(screen.getByRole("button", { name: /retry/i }));
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it("routes per-message actions with the message id", () => {
    const onRegenerate = vi.fn();
    const onEditPrompt = vi.fn();
    renderThread({ messages: THREAD, onRegenerate, onEditPrompt });
    fireEvent.click(screen.getByRole("button", { name: /regenerate/i }));
    fireEvent.click(screen.getByRole("button", { name: /edit prompt/i }));
    expect(onRegenerate).toHaveBeenCalledWith("a1");
    expect(onEditPrompt).toHaveBeenCalledWith("a1");
  });
});
