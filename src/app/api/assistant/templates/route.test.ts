import { beforeEach, expect, it, vi } from "vitest";
vi.mock("@/lib/prompt-template-store", () => ({
  listPromptTemplates: vi.fn(), changePromptTemplate: vi.fn(), TemplateNotFoundError: class extends Error {},
}));
import { listPromptTemplates, changePromptTemplate, TemplateNotFoundError } from "@/lib/prompt-template-store";
import { GET, POST } from "./route";
const request = (body: unknown) => new Request("http://test/api/assistant/templates", { method: "POST", body: JSON.stringify(body) });
beforeEach(() => vi.clearAllMocks());
it("lists saved templates", async () => {
  vi.mocked(listPromptTemplates).mockResolvedValue([{ id: "t1", name: "Saved", content: "Prompt" }]);
  expect(await (await GET()).json()).toEqual([{ id: "t1", name: "Saved", content: "Prompt" }]);
});
it("trims names but preserves exact content", async () => {
  const content = "  My prompt\n{{DOCUMENTS}}\n";
  vi.mocked(changePromptTemplate).mockResolvedValue({ id: "t1", name: "Mine", content });
  const response = await POST(request({ action: "create", name: " Mine ", content }));
  expect(response.status).toBe(200);
  expect(changePromptTemplate).toHaveBeenCalledWith({ action: "create", name: "Mine", content });
  expect(await response.json()).toEqual({ template: { id: "t1", name: "Mine", content } });
});
it.each([
  { action: "update", id: "t1", content: "Edited" },
  { action: "rename", id: "t1", name: "New name" },
  { action: "delete", id: "t1" },
])("accepts custom template actions: $action", async (action) => {
  vi.mocked(changePromptTemplate).mockResolvedValue(null);
  expect((await POST(request(action))).status).toBe(200);
  expect(changePromptTemplate).toHaveBeenCalledWith(action);
});
it.each([
  {}, { action: "create", name: "", content: "x" },
  { action: "create", name: "   ", content: "x" },
  { action: "create", name: "x".repeat(121), content: "x" },
  { action: "create", name: "Name", content: " \n" },
  { action: "update", id: "t1", content: "x".repeat(100001) },
  { action: "update", id: "builtin:general", content: "x" },
  { action: "rename", id: "builtin:contract", name: "Hijack" },
  { action: "delete", id: "builtin:general" },
])("rejects malformed or built-in mutations (%#)", async (action) => {
  expect((await POST(request(action))).status).toBe(400);
  expect(changePromptTemplate).not.toHaveBeenCalled();
});
it("rejects malformed JSON", async () => {
  expect((await POST(new Request("http://test", { method: "POST", body: "{" }))).status).toBe(400);
});
it("reports missing templates without losing the caller's draft", async () => {
  vi.mocked(changePromptTemplate).mockRejectedValue(new TemplateNotFoundError());
  const response = await POST(request({ action: "delete", id: "missing" }));
  expect(response.status).toBe(404);
  expect(await response.json()).toEqual({ error: expect.stringContaining("Save a copy") });
});
