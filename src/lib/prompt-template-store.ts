import { prisma } from "./prisma";
import type { TemplateAction } from "./prompt-templates";

const select = { id: true, name: true, content: true } as const;
export class TemplateNotFoundError extends Error {}
export function listPromptTemplates() {
  return prisma.promptTemplate.findMany({ select, orderBy: [{ createdAt: "asc" }, { id: "asc" }] });
}

export async function changePromptTemplate(action: TemplateAction) {
  if (action.action === "create") {
    return prisma.promptTemplate.create({ data: { name: action.name, content: action.content }, select });
  }
  // Keep the existence check and subsequent read/write atomic.
  return prisma.$transaction(async (db) => {
    const where = { id: action.id };
    const exists = await db.promptTemplate.findUnique({ where, select: { id: true } });
    if (!exists) throw new TemplateNotFoundError();
    if (action.action === "delete") {
      await db.promptTemplate.delete({ where });
      return null;
    }
    return db.promptTemplate.update({
      where,
      data: action.action === "rename" ? { name: action.name } : { content: action.content },
      select,
    });
  });
}
