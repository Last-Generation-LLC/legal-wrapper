import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AssistantUIMessage } from "@/lib/chat-ui";

// Mock the Prisma singleton (established pattern — see documents.test.ts).
vi.mock("@/lib/prisma", () => ({
  prisma: {
    chatSession: { findFirst: vi.fn(), findUnique: vi.fn(), findMany: vi.fn(), create: vi.fn(), update: vi.fn(), updateMany: vi.fn(), delete: vi.fn() },
    message: {
      findMany: vi.fn(),
      deleteMany: vi.fn(),
      createMany: vi.fn(),
      create: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

import { prisma } from "@/lib/prisma";
import {
  appendMessage,
  getActiveSession,
  loadActiveThread,
  replaceThread,
  changeSession,
  renameSession,
  listSessions,
  SessionConflictError,
  SessionNotFoundError,
} from "./chat-store";

const SESSION = {
  id: "s1",
  title: null,
  createdAt: new Date(),
  archivedAt: null,
  selectedDocIds: '["d1","d2"]',
};

function uiMessage(id: string, role: "user" | "assistant", text: string): AssistantUIMessage {
  return { id, role, parts: [{ type: "text", text }] };
}

function row(id: string, message: unknown, position: number) {
  return {
    id,
    chatSessionId: "s1",
    role: "user",
    content: typeof message === "string" ? message : JSON.stringify(message),
    position,
    createdAt: new Date(),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(prisma.chatSession.findUnique).mockResolvedValue(SESSION);
  vi.mocked(prisma.message.findMany).mockResolvedValue([]);
  vi.mocked(prisma.$transaction).mockImplementation(async (input: unknown) =>
    typeof input === "function" ? input(prisma) : Promise.all(input as Promise<unknown>[]) as never);
});

describe("getActiveSession", () => {
  it("returns the existing active session", async () => {
    vi.mocked(prisma.chatSession.findFirst).mockResolvedValue(SESSION);
    expect(await getActiveSession()).toEqual(SESSION);
    expect(prisma.chatSession.create).not.toHaveBeenCalled();
  });

  it("creates one lazily when none is active", async () => {
    vi.mocked(prisma.chatSession.findFirst).mockResolvedValue(null);
    vi.mocked(prisma.chatSession.create).mockResolvedValue(SESSION);
    expect(await getActiveSession()).toEqual(SESSION);
    expect(prisma.chatSession.findFirst).toHaveBeenCalledWith({
      where: { archivedAt: null },
      orderBy: { createdAt: "desc" },
    });
  });
});

describe("loadActiveThread", () => {
  it("returns messages in position order with the parsed doc selection", async () => {
    vi.mocked(prisma.chatSession.findFirst).mockResolvedValue(SESSION);
    const m0 = uiMessage("m0", "user", "hi");
    const m1 = uiMessage("m1", "assistant", "hello");
    vi.mocked(prisma.message.findMany).mockResolvedValue([row("m0", m0, 0), row("m1", m1, 1)]);

    const thread = await loadActiveThread();
    expect(thread.sessionId).toBe("s1");
    expect(thread.messages).toEqual([m0, m1]);
    expect(thread.selectedDocIds).toEqual(["d1", "d2"]);
    expect(prisma.message.findMany).toHaveBeenCalledWith({
      where: { chatSessionId: "s1" },
      orderBy: { position: "asc" },
    });
  });

  it("skips malformed rows instead of failing the whole thread", async () => {
    vi.mocked(prisma.chatSession.findFirst).mockResolvedValue(SESSION);
    const good = uiMessage("m1", "user", "kept");
    vi.mocked(prisma.message.findMany).mockResolvedValue([
      row("m0", "{not json", 0),
      row("mx", { id: "mx" }, 1), // missing role/parts
      row("mb", { id: "mb", role: "banana", parts: [] }, 2), // invalid role
      row("m1", good, 3),
    ]);
    const thread = await loadActiveThread();
    expect(thread.messages).toEqual([good]);
  });

  it("degrades a malformed doc selection to empty", async () => {
    vi.mocked(prisma.chatSession.findFirst).mockResolvedValue({
      ...SESSION,
      selectedDocIds: "{oops",
    });
    vi.mocked(prisma.message.findMany).mockResolvedValue([]);
    expect((await loadActiveThread()).selectedDocIds).toEqual([]);
  });
});

describe("replaceThread", () => {
  it("rewrites the thread atomically with 0-based positions and the selection", async () => {
    await replaceThread("s1", [uiMessage("a", "user", "q"), uiMessage("b", "assistant", "a")], [
      "d1",
    ]);

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(prisma.message.deleteMany).toHaveBeenCalledWith({ where: { chatSessionId: "s1" } });
    expect(prisma.message.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({ id: "a", role: "user", position: 0 }),
        expect.objectContaining({ id: "b", role: "assistant", position: 1 }),
      ],
    });
    expect(prisma.chatSession.update).toHaveBeenCalledWith({
      where: { id: "s1" },
      data: { selectedDocIds: '["d1"]' },
    });
  });

  it("stores the full UIMessage JSON so parts and metadata round-trip", async () => {
    const message: AssistantUIMessage = {
      ...uiMessage("a", "assistant", "Delaware"),
      metadata: { createdAt: 123, usage: { uncachedInputTokens: 10, cacheReadInputTokens: 0, cacheWriteInputTokens: 0, outputTokens: 2 } },
    };
    await replaceThread("s1", [message], []);
    const created = vi.mocked(prisma.message.createMany).mock.calls[0][0] as {
      data: Array<{ content: string }>;
    };
    expect(JSON.parse(created.data[0].content)).toEqual(message);
  });
});

describe("appendMessage", () => {
  it("creates the finished assistant turn at the given position", async () => {
    const message = uiMessage("m9", "assistant", "done");
    await appendMessage("s1", message, 4);
    expect(prisma.message.create).toHaveBeenCalledWith({
      data: {
        id: "m9",
        chatSessionId: "s1",
        role: "assistant",
        content: JSON.stringify(message),
        position: 4,
      },
    });
  });
});

describe("session management", () => {
  it("lists only metadata and message counts, newest first", async () => {
    await listSessions();
    expect(prisma.chatSession.findMany).toHaveBeenCalledWith({
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      select: { id: true, title: true, createdAt: true, archivedAt: true, _count: { select: { messages: true } } },
    });
  });

  it("reopens archived messages and selection while saving outgoing selection atomically", async () => {
    const archived = { ...SESSION, id: "s2", archivedAt: new Date(), selectedDocIds: '["d3"]' };
    vi.mocked(prisma.chatSession.findUnique).mockResolvedValueOnce(SESSION).mockResolvedValueOnce(archived);
    vi.mocked(prisma.chatSession.update).mockResolvedValueOnce(SESSION).mockResolvedValueOnce({ ...archived, archivedAt: null });
    const message = uiMessage("saved", "assistant", "Saved answer");
    vi.mocked(prisma.message.findMany).mockResolvedValue([row("saved", message, 0)]);
    expect(await changeSession({ action: "open", sessionId: "s2" }, "s1", ["d4"])).toEqual({
      sessionId: "s2", messages: [message], selectedDocIds: ["d3"],
    });
    expect(prisma.chatSession.update).toHaveBeenNthCalledWith(1, {
      where: { id: "s1" }, data: { archivedAt: expect.any(Date), selectedDocIds: '["d4"]' },
    });
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });

  it("deletes an archived session without replacing the active thread", async () => {
    vi.mocked(prisma.chatSession.findUnique).mockResolvedValueOnce(SESSION).mockResolvedValueOnce({ ...SESSION, id: "s2", archivedAt: new Date() });
    expect(await changeSession({ action: "delete", sessionId: "s2" }, "s1", [])).toBeNull();
    expect(prisma.chatSession.delete).toHaveBeenCalledWith({ where: { id: "s2" } });
    expect(prisma.chatSession.create).not.toHaveBeenCalled();
    expect(prisma.chatSession.update).not.toHaveBeenCalled();
  });

  it("deletes the active thread and returns an empty replacement", async () => {
    vi.mocked(prisma.chatSession.create).mockResolvedValue({ ...SESSION, id: "new", selectedDocIds: "[]" });
    expect(await changeSession({ action: "delete", sessionId: "s1" }, "s1", [])).toEqual({ sessionId: "new", messages: [], selectedDocIds: [] });
    expect(prisma.chatSession.delete).toHaveBeenCalledWith({ where: { id: "s1" } });
  });

  it("new session saves the outgoing selection and returns a fresh thread", async () => {
    vi.mocked(prisma.chatSession.create).mockResolvedValue({ ...SESSION, id: "new", selectedDocIds: "[]" });
    expect((await changeSession({ action: "new" }, "s1", ["d2"]))?.sessionId).toBe("new");
    expect(prisma.chatSession.update).toHaveBeenCalledWith({ where: { id: "s1" }, data: { archivedAt: expect.any(Date), selectedDocIds: '["d2"]' } });
  });

  it.each(["open", "delete"] as const)("missing %s target cannot archive or delete the current session", async (action) => {
    vi.mocked(prisma.chatSession.findUnique).mockResolvedValueOnce(SESSION).mockResolvedValueOnce(null);
    await expect(changeSession({ action, sessionId: "gone" }, "s1", [])).rejects.toBeInstanceOf(SessionNotFoundError);
    expect(prisma.chatSession.update).not.toHaveBeenCalled();
    expect(prisma.chatSession.delete).not.toHaveBeenCalled();
  });

  it("rejects a stale tab's switch and chat write before modifying any messages", async () => {
    vi.mocked(prisma.chatSession.findUnique).mockResolvedValue({ ...SESSION, archivedAt: new Date() });
    await expect(changeSession({ action: "new" }, "s1", [])).rejects.toBeInstanceOf(SessionConflictError);
    await expect(replaceThread("s1", [], [])).rejects.toBeInstanceOf(SessionConflictError);
    expect(prisma.chatSession.update).not.toHaveBeenCalled();
    expect(prisma.message.deleteMany).not.toHaveBeenCalled();
  });

  it("renames existing sessions and rejects deleted ones", async () => {
    vi.mocked(prisma.chatSession.updateMany).mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 0 });
    await renameSession("s1", "Lease review");
    expect(prisma.chatSession.updateMany).toHaveBeenCalledWith({ where: { id: "s1" }, data: { title: "Lease review" } });
    await expect(renameSession("gone", "Lease review")).rejects.toBeInstanceOf(SessionNotFoundError);
  });
});
