import { afterAll, beforeAll, beforeEach, expect, it, vi } from "vitest";
import { readFile, readdir, rm } from "node:fs/promises";
import { join } from "node:path";

// A disposable SQLite database; never connects to prisma/dev.db.
vi.mock("@/lib/prisma", async () => {
  const { PrismaClient } = await import("@prisma/client");
  const { mkdtemp } = await import("node:fs/promises");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const directory = await mkdtemp(join(tmpdir(), "legal-session-test-"));
  return { prisma: new PrismaClient({ datasourceUrl: `file:${join(directory, "test.db")}` }), directory };
});
import { prisma } from "@/lib/prisma";
import { changeSession, loadActiveThread, replaceThread } from "./chat-store";

beforeAll(async () => {
  const root = join(process.cwd(), "prisma/migrations");
  const dirs = (await readdir(root, { withFileTypes: true })).filter((d) => d.isDirectory()).map((d) => d.name).sort();
  for (const dir of dirs) {
    const sql = await readFile(join(root, dir, "migration.sql"), "utf8");
    for (const statement of sql.split(";").filter((s) => s.trim())) await prisma.$executeRawUnsafe(statement);
  }
});
beforeEach(async () => { await prisma.chatSession.deleteMany(); });
afterAll(async () => {
  await prisma.$disconnect();
  const { directory } = await import("@/lib/prisma") as unknown as { directory: string };
  await rm(directory, { recursive: true, force: true });
});

it("round-trips an archived thread, then cascades active deletion to its messages", async () => {
  const active = await prisma.chatSession.create({ data: {} });
  const message = { id: "m1", role: "user" as const, parts: [{ type: "text" as const, text: "Lease question" }] };
  await replaceThread(active.id, [message], ["doc1"]);
  const fresh = (await changeSession({ action: "new" }, active.id, ["doc2"]))!;
  expect((await prisma.chatSession.findUniqueOrThrow({ where: { id: active.id } })).archivedAt).not.toBeNull();
  const reopened = await changeSession({ action: "open", sessionId: active.id }, fresh.sessionId, []);
  expect(reopened).toEqual({ sessionId: active.id, messages: [message], selectedDocIds: ["doc2"] });
  const replacement = (await changeSession({ action: "delete", sessionId: active.id }, active.id, []))!;
  expect(replacement.messages).toEqual([]);
  expect(await prisma.message.count()).toBe(0);
  expect(await prisma.chatSession.count({ where: { archivedAt: null } })).toBe(1);
  expect((await loadActiveThread()).sessionId).toBe(replacement.sessionId);
});

it("rolls back a failed thread replacement, keeping the saved messages and selection", async () => {
  const active = await prisma.chatSession.create({ data: {} });
  const message = { id: "m1", role: "user" as const, parts: [{ type: "text" as const, text: "Keep me" }] };
  await replaceThread(active.id, [message], ["doc1"]);
  // Duplicate primary keys fail after deleteMany has executed inside the transaction.
  await expect(replaceThread(active.id, [message, message], ["doc2"])).rejects.toThrow();
  expect(await loadActiveThread()).toEqual({ sessionId: active.id, messages: [message], selectedDocIds: ["doc1"] });
});

it("rolls back active deletion if the replacement session cannot be created", async () => {
  const active = await prisma.chatSession.create({ data: {} });
  await prisma.$executeRawUnsafe(`CREATE TRIGGER reject_new_session BEFORE INSERT ON ChatSession BEGIN SELECT RAISE(ABORT, 'test failure'); END`);
  try {
    await expect(changeSession({ action: "delete", sessionId: active.id }, active.id, [])).rejects.toThrow();
    expect(await prisma.chatSession.findUnique({ where: { id: active.id } })).not.toBeNull();
  } finally {
    await prisma.$executeRawUnsafe("DROP TRIGGER reject_new_session");
  }
});
