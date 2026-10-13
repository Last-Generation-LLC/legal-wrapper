import { z } from "zod";
import { CONTRACT_REVIEW_SYSTEM_PROMPT, DEFAULT_SYSTEM_PROMPT } from "./wrapper";

export type PromptTemplate = { id: string; name: string; content: string };
export const BUILTIN_PROMPT_TEMPLATES: readonly PromptTemplate[] = [
  { id: "builtin:general", name: "General legal", content: DEFAULT_SYSTEM_PROMPT },
  { id: "builtin:contract", name: "Contract review", content: CONTRACT_REVIEW_SYSTEM_PROMPT },
];
export const MAX_TEMPLATE_LENGTH = 100_000;
const name = z.string().trim().min(1).max(120);
const content = z.string().max(MAX_TEMPLATE_LENGTH).refine((value) => value.trim().length > 0);
const id = z.string().min(1).refine((value) => !value.startsWith("builtin:"));
export const templateActionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("create"), name, content }),
  z.object({ action: z.literal("update"), id, content }),
  z.object({ action: z.literal("rename"), id, name }),
  z.object({ action: z.literal("delete"), id }),
]);
export type TemplateAction = z.infer<typeof templateActionSchema>;
