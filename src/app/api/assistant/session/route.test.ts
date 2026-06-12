import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/chat-store", () => ({
  archiveActiveSession: vi.fn(),
}));

import { archiveActiveSession } from "@/lib/chat-store";
import { POST } from "./route";

beforeEach(() => vi.clearAllMocks());

describe("POST /api/assistant/session", () => {
  it("archives the active session and returns the fresh session id", async () => {
    vi.mocked(archiveActiveSession).mockResolvedValue({
      id: "s2",
      title: null,
      createdAt: new Date(),
      archivedAt: null,
      selectedDocIds: "[]",
    });
    const res = await POST();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ sessionId: "s2" });
    expect(archiveActiveSession).toHaveBeenCalledTimes(1);
  });
});
