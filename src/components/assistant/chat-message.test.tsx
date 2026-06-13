// @vitest-environment jsdom
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { FOOTER_OPEN, FOOTER_CLOSE, type VerifiedAnswer } from "@/lib/contract";
import type { DocumentMeta } from "@/lib/documents";
import type { AssistantUIMessage } from "@/lib/chat-ui";
import { ChatMessage } from "./chat-message";

const DOCS: DocumentMeta[] = [
  {
    id: "doc1",
    filename: "Aperture_MSA_v4.pdf",
    title: null,
    mimeType: "application/pdf",
    tokenCount: 31420,
    tokenCountEstimated: false,
    createdAt: new Date(),
  },
];

const ANSWER: VerifiedAnswer = {
  value: "The cap is 2x fees.",
  citations: [
    { docId: "doc1", quote: "liability shall not exceed", section: "§12.1", verified: true, page: 22 },
    { docId: "doc1", quote: "fabricated quote here", section: "§9", verified: false },
  ],
  confidence: 0.94,
};

function assistantMessage(overrides: Partial<AssistantUIMessage> = {}): AssistantUIMessage {
  return {
    id: "a1",
    role: "assistant",
    parts: [
      { type: "text", text: `The cap is 2x fees.\n${FOOTER_OPEN}{}${FOOTER_CLOSE}` },
      { type: "data-citations", data: ANSWER },
    ],
    metadata: { createdAt: new Date(2026, 5, 12, 10, 42).getTime(), usage: { uncachedInputTokens: 54120, outputTokens: 412, cacheReadInputTokens: 45800, cacheWriteInputTokens: 0 } },
    ...overrides,
  };
}

function renderMessage(message: AssistantUIMessage, props: Partial<React.ComponentProps<typeof ChatMessage>> = {}) {
  return render(
    <ChatMessage
      message={message}
      documents={DOCS}
      busy={false}
      onRegenerate={() => {}}
      onEditPrompt={() => {}}
      {...props}
    />,
  );
}

describe("ChatMessage — roles and text", () => {
  it("renders the user role tag and plain text", () => {
    renderMessage({ id: "u1", role: "user", parts: [{ type: "text", text: "Compare the clauses." }] });
    expect(screen.getByText("You")).toBeInTheDocument();
    expect(screen.getByText("Compare the clauses.")).toBeInTheDocument();
  });

  it("renders the assistant role tag and strips the citation footer", () => {
    renderMessage(assistantMessage());
    expect(screen.getByText("LL")).toBeInTheDocument();
    expect(screen.getByText(/The cap is 2x fees\./)).toBeInTheDocument();
    expect(screen.queryByText(new RegExp(FOOTER_OPEN))).not.toBeInTheDocument();
  });

  it("renders **bold** spans as <strong>", () => {
    renderMessage({
      id: "a2",
      role: "assistant",
      parts: [{ type: "text", text: "A **material** change." }],
    });
    const strong = screen.getByText("material");
    expect(strong.tagName).toBe("STRONG");
  });
});

describe("ChatMessage — metadata line", () => {
  it("shows the timestamp and token accounting", () => {
    renderMessage(assistantMessage());
    expect(screen.getByText("10:42")).toBeInTheDocument();
    expect(screen.getByText("in 54,120 · out 412 · cached 45,800")).toBeInTheDocument();
  });

  it("shows the confidence value with the band color dot", () => {
    renderMessage(assistantMessage());
    const dot = screen.getByTitle(/confidence/i);
    expect(dot).toHaveClass("bg-green"); // 0.94 > 0.92
    expect(screen.getByText("0.94")).toBeInTheDocument();
  });

  it("omits token accounting when usage has not arrived", () => {
    renderMessage(assistantMessage({ metadata: { createdAt: Date.now() } }));
    expect(screen.queryByText(/in .* · out/)).not.toBeInTheDocument();
  });
});

describe("ChatMessage — citations", () => {
  it("renders a pill per citation in the DocName §X · p.N format", () => {
    renderMessage(assistantMessage());
    expect(screen.getByText(/Aperture_MSA_v4 §12\.1 · p\.22/)).toBeInTheDocument();
  });

  it("flags unverified citations with the warn tone and a hint", () => {
    renderMessage(assistantMessage());
    const unverified = screen.getByText(/§9 · unverified/);
    expect(unverified.closest("span[class*='text-amber']")).not.toBeNull();
    const verified = screen.getByText(/§12\.1 · p\.22/);
    expect(verified.closest("span[class*='text-blue']")).not.toBeNull();
  });

  it("falls back to the docId when the document is no longer in the list", () => {
    renderMessage(
      assistantMessage({
        parts: [
          { type: "text", text: "x" },
          {
            type: "data-citations",
            data: { ...ANSWER, citations: [{ docId: "ghost", quote: "q".repeat(12), verified: true }] },
          },
        ],
      }),
    );
    expect(screen.getByText(/ghost/)).toBeInTheDocument();
  });
});

describe("ChatMessage — actions", () => {
  it("shows Copy / Regenerate / Edit prompt on assistant messages only", () => {
    const { unmount } = renderMessage(assistantMessage());
    expect(screen.getByRole("button", { name: /copy/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /regenerate/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /edit prompt/i })).toBeInTheDocument();
    unmount();

    renderMessage({ id: "u1", role: "user", parts: [{ type: "text", text: "q" }] });
    expect(screen.queryByRole("button", { name: /regenerate/i })).not.toBeInTheDocument();
  });

  it("invokes the regenerate and edit-prompt callbacks", () => {
    const onRegenerate = vi.fn();
    const onEditPrompt = vi.fn();
    renderMessage(assistantMessage(), { onRegenerate, onEditPrompt });
    fireEvent.click(screen.getByRole("button", { name: /regenerate/i }));
    fireEvent.click(screen.getByRole("button", { name: /edit prompt/i }));
    expect(onRegenerate).toHaveBeenCalledOnce();
    expect(onEditPrompt).toHaveBeenCalledOnce();
  });

  it("disables Regenerate and Edit prompt while a call is in flight", () => {
    renderMessage(assistantMessage(), { busy: true });
    expect(screen.getByRole("button", { name: /regenerate/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /edit prompt/i })).toBeDisabled();
  });

  it("copies the footer-stripped prose to the clipboard", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    renderMessage(assistantMessage());
    fireEvent.click(screen.getByRole("button", { name: /copy/i }));
    expect(writeText).toHaveBeenCalledWith("The cap is 2x fees.");
  });
});
