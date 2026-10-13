import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("@/lib/chat-store", () => ({
  listSessions: vi.fn(), changeSession: vi.fn(), renameSession: vi.fn(),
  SessionConflictError: class extends Error {}, SessionNotFoundError: class extends Error {},
}));
import { listSessions, changeSession, renameSession, SessionConflictError, SessionNotFoundError } from "@/lib/chat-store";
import { GET, POST } from "./route";
const request = (body: unknown) => new Request("http://test/api/assistant/session", {
  method: "POST", body: JSON.stringify(body),
});
beforeEach(() => vi.clearAllMocks());
describe("session API", () => {
  it("lists sessions", async () => {
    vi.mocked(listSessions).mockResolvedValue([]);
    expect(await (await GET()).json()).toEqual([]);
  });
  it.each(["new", "open", "delete"])("handles %s and returns its thread", async (action) => {
    const thread = { sessionId: "s2", messages: [], selectedDocIds: [] };
    vi.mocked(changeSession).mockResolvedValue(thread);
    const res = await POST(request({ action, sessionId: "s2", currentSessionId: "s1", selectedDocIds: ["d1"] }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ thread });
    expect(changeSession).toHaveBeenCalledWith(expect.objectContaining({ action }), "s1", ["d1"]);
  });
  it("trims names before storing", async () => {
    expect((await POST(request({ action: "rename", sessionId: "s1", title: " Lease " }))).status).toBe(200);
    expect(renameSession).toHaveBeenCalledWith("s1", "Lease");
  });
  it.each(["", "   ", "x".repeat(121)])("rejects invalid names", async (title) => {
    expect((await POST(request({ action: "rename", sessionId: "s1", title }))).status).toBe(400);
    expect(renameSession).not.toHaveBeenCalled();
  });
  it("rejects malformed JSON and missing switch context", async () => {
    expect((await POST(new Request("http://test", { method: "POST", body: "{" }))).status).toBe(400);
    expect((await POST(request({ action: "open", sessionId: "s2" }))).status).toBe(400);
    expect(changeSession).not.toHaveBeenCalled();
  });
  it.each([[new SessionConflictError(), 409], [new SessionNotFoundError(), 404]] as const)("maps store errors to HTTP", async (error, status) => {
    vi.mocked(changeSession).mockRejectedValueOnce(error);
    expect((await POST(request({ action: "open", sessionId: "s2", currentSessionId: "s1", selectedDocIds: [] }))).status).toBe(status);
  });
});
