import { afterAll, beforeAll, beforeEach, expect, it, vi } from "vitest";
import { readFile, readdir, rm } from "node:fs/promises";
import { join } from "node:path";

// A disposable SQLite database; never connects to prisma/dev.db.
vi.mock("@/lib/prisma", async () => {
  const { PrismaClient } = await import("@prisma/client");
  const { mkdtemp } = await import("node:fs/promises");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const directory = await mkdtemp(join(tmpdir(), "legal-template-test-"));
  return { prisma: new PrismaClient({ datasourceUrl: `file:${join(directory, "test.db")}` }), directory };
});
import { prisma } from "@/lib/prisma";
import { changePromptTemplate, listPromptTemplates, TemplateNotFoundError } from "./prompt-template-store";

beforeAll(async () => {
  const root = join(process.cwd(), "prisma/migrations");
  const dirs = (await readdir(root, { withFileTypes: true })).filter((d) => d.isDirectory()).map((d) => d.name).sort();
  for (const dir of dirs) {
    const sql = await readFile(join(root, dir, "migration.sql"), "utf8");
    for (const statement of sql.split(";").filter((s) => s.trim())) await prisma.$executeRawUnsafe(statement);
  }
});
beforeEach(async () => { await prisma.promptTemplate.deleteMany(); });
afterAll(async () => {
  await prisma.$disconnect();
  const { directory } = await import("@/lib/prisma") as unknown as { directory: string };
  await rm(directory, { recursive: true, force: true });
});

it("persists exact content, updates and renames independently, then deletes", async () => {
  const content = "  My instructions\n{{DOCUMENTS}}\n";
  const created = (await changePromptTemplate({ action: "create", name: "Mine", content }))!;
  await prisma.$disconnect(); // Prove this is persisted, not in-memory state.
  expect(await listPromptTemplates()).toEqual([created]);
  await changePromptTemplate({ action: "update", id: created.id, content: "Updated" });
  await changePromptTemplate({ action: "rename", id: created.id, name: "Renamed" });
  expect(await listPromptTemplates()).toEqual([{ id: created.id, name: "Renamed", content: "Updated" }]);
  expect(await changePromptTemplate({ action: "delete", id: created.id })).toBeNull();
  expect(await listPromptTemplates()).toEqual([]);
});

it.each(["update", "rename", "delete"] as const)("rejects %s on a missing record", async (action) => {
  await expect(changePromptTemplate({ action, id: "missing", name: "Name", content: "Content" })).rejects.toBeInstanceOf(TemplateNotFoundError);
  expect(await listPromptTemplates()).toEqual([]);
});

it("keeps same-named templates independent and leaves chat data intact", async () => {
  const session = await prisma.chatSession.create({ data: { title: "Keep this chat" } });
  const first = (await changePromptTemplate({ action: "create", name: "Same", content: "First" }))!;
  const second = (await changePromptTemplate({ action: "create", name: "Same", content: "Second" }))!;
  await changePromptTemplate({ action: "delete", id: first.id });
  expect(await listPromptTemplates()).toEqual([second]);
  expect(await prisma.chatSession.findUnique({ where: { id: session.id } })).not.toBeNull();
});
