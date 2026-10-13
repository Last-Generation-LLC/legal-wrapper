// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { AssistantChat } from "./assistant-chat";
import { DocsProvider, useDocs } from "@/components/documents/docs-context";
import type { DocumentMeta } from "@/lib/documents";

vi.mock("@/components/documents/use-upload", () => ({ useUpload: () => ({ upload: vi.fn(), uploading: false }) }));
const sessions = [
  { id: "s1", title: "Current lease", createdAt: "2026-10-12T12:00:00Z", archivedAt: null, _count: { messages: 1 } },
  { id: "s2", title: "Old lease", createdAt: "2026-10-11T12:00:00Z", archivedAt: "2026-10-12T12:00:00Z", _count: { messages: 2 } },
];
const message = (id: string, text: string) => ({ id, role: "user" as const, parts: [{ type: "text" as const, text }] });
const restored = { sessionId: "s2", messages: [message("m2", "Archived question")], selectedDocIds: ["d2", "deleted-document"] };
let mutate: (body: Record<string, unknown>) => Promise<Response>;
let chatSignal: AbortSignal | undefined;
let chatBody: Record<string, unknown> | undefined;
const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
  if (String(input).endsWith("/chat")) {
    chatSignal = init?.signal as AbortSignal;
    chatBody = JSON.parse(init?.body as string);
    return new Promise<Response>((_, reject) => {
      chatSignal!.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
    });
  }
  if (init?.method === "POST") return mutate(JSON.parse(init.body as string));
  return Response.json(sessions);
});
function Selection() {
  const { selectedIds } = useDocs();
  return <output aria-label="Selection">{selectedIds.join(",")}</output>;
}
function mount() {
  render(<DocsProvider documents={[
    { id: "d1", filename: "one.pdf", tokenCount: 10 },
    { id: "d2", filename: "two.pdf", tokenCount: 20 },
  ] as DocumentMeta[]} initialSelectedIds={["d1"]}>
    <AssistantChat initialSessionId="s1" initialMessages={[message("m1", "Current question")]} modelLabel="Opus" modelId="claude-opus-4-6" />
    <Selection />
  </DocsProvider>);
}
async function showSessions() {
  fireEvent.click(screen.getByRole("button", { name: "Sessions" }));
  await screen.findByRole("button", { name: "Open Old lease" });
}
beforeEach(() => {
  fetchMock.mockClear();
  chatSignal = undefined;
  chatBody = undefined;
  mutate = async () => Response.json({ thread: restored });
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("Assistant session management", () => {
  it("opens saved messages and existing documents, clearing the outgoing draft", async () => {
    mount();
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "Unsent draft" } });
    await showSessions();
    fireEvent.click(screen.getByRole("button", { name: "Open Old lease" }));
    await screen.findByText("Archived question");
    expect(screen.queryByText("Current question")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Selection")).toHaveTextContent(/^d2$/);
    expect(screen.getByRole("textbox")).toHaveValue("");
    const post = fetchMock.mock.calls.find(([, init]) => init?.method === "POST")!;
    expect(JSON.parse(post[1]!.body as string)).toEqual({ action: "open", sessionId: "s2", currentSessionId: "s1", selectedDocIds: ["d1"] });
  });

  it("keeps messages, draft, and selection on a failed switch and shows the error", async () => {
    mutate = async () => Response.json({ error: "Session not found. Refresh the session list." }, { status: 404 });
    mount();
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "Keep this" } });
    await showSessions();
    fireEvent.click(screen.getByRole("button", { name: "Open Old lease" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Session not found");
    expect(screen.getByText("Current question")).toBeInTheDocument();
    expect(screen.getByRole("textbox")).toHaveValue("Keep this");
    expect(screen.getByLabelText("Selection")).toHaveTextContent(/^d1$/);
  });

  it("stops a pending stream before switching and binds the next send to the reopened ID", async () => {
    mount();
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "Next question" } });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    await waitFor(() => expect(chatBody?.sessionId).toBe("s1"));
    const oldSignal = chatSignal!;
    mutate = async () => { expect(oldSignal.aborted).toBe(true); return Response.json({ thread: restored }); };
    await showSessions();
    fireEvent.click(screen.getByRole("button", { name: "Open Old lease" }));
    await screen.findByText("Archived question");
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "Continue archived chat" } });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    await waitFor(() => expect(chatBody?.sessionId).toBe("s2"));
    expect(chatBody?.docIds).toEqual(["d2"]);
    expect(JSON.stringify(chatBody?.messages)).not.toContain("Current question");
    // Clean up the second deliberately pending call through the real stop path.
    fireEvent.click(screen.getByRole("button", { name: "New session" }));
    await waitFor(() => expect(chatSignal?.aborted).toBe(true));
  });

  it("serializes repeated session actions and blocks sending during the change", async () => {
    let resolve!: (res: Response) => void;
    mutate = vi.fn(() => new Promise<Response>((r) => { resolve = r; }));
    mount();
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "Draft" } });
    const button = screen.getByRole("button", { name: "New session" });
    fireEvent.click(button);
    fireEvent.click(button);
    await waitFor(() => expect(mutate).toHaveBeenCalledTimes(1));
    expect(screen.getByRole("button", { name: "Send" })).toBeDisabled();
    resolve(Response.json({ thread: { sessionId: "s3", messages: [], selectedDocIds: [] } }));
    await screen.findByText("Ask a legal question");
    expect(screen.getByLabelText("Selection")).toBeEmptyDOMElement();
  });

  it("renames inline, confirms deletion, and leaves the active chat intact when deleting an archive", async () => {
    mutate = vi.fn(async () => Response.json({ thread: null }));
    mount();
    await showSessions();
    fireEvent.click(screen.getByRole("button", { name: "Rename Old lease" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Session name" }), { target: { value: "Reviewed lease" } });
    fireEvent.click(screen.getByRole("button", { name: "Save name" }));
    await waitFor(() => expect(mutate).toHaveBeenCalledWith(expect.objectContaining({ action: "rename", sessionId: "s2", title: "Reviewed lease" })));
    await waitFor(() => expect(screen.queryByRole("textbox", { name: "Session name" })).not.toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "Delete Old lease" }));
    expect(mutate).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByText("Delete permanently")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Delete Old lease" }));
    fireEvent.click(screen.getByRole("button", { name: "Delete permanently" }));
    await waitFor(() => expect(mutate).toHaveBeenCalledWith(expect.objectContaining({ action: "delete", sessionId: "s2" })));
    expect(screen.getByText("Current question")).toBeInTheDocument();
  });

  it("deletes the active chat into a fresh empty session", async () => {
    mutate = async () => Response.json({ thread: { sessionId: "s3", messages: [], selectedDocIds: [] } });
    mount();
    await showSessions();
    fireEvent.click(screen.getByRole("button", { name: "Delete Current lease" }));
    expect(screen.getByText(/new empty session will open/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Delete permanently" }));
    await screen.findByText("Ask a legal question");
    expect(screen.queryByText("Current question")).not.toBeInTheDocument();
  });
});

it("shows a list-loading failure and lets the user retry", async () => {
  fetchMock.mockRejectedValueOnce(new Error("offline"));
  mount();
  fireEvent.click(screen.getByRole("button", { name: "Sessions" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Could not load sessions");
  fireEvent.click(screen.getByRole("button", { name: "Refresh list" }));
  await screen.findByRole("button", { name: "Open Old lease" });
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
});
