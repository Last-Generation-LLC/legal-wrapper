import { templateActionSchema } from "@/lib/prompt-templates";
import { changePromptTemplate, listPromptTemplates, TemplateNotFoundError } from "@/lib/prompt-template-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json(await listPromptTemplates());
}

export async function POST(request: Request) {
  let body: unknown;
  try { body = await request.json(); }
  catch { return Response.json({ error: "Body must be JSON." }, { status: 400 }); }
  const parsed = templateActionSchema.safeParse(body);
  if (!parsed.success) return Response.json({
    error: "Invalid template request. Use a 1–120 character name and a nonblank prompt up to 100,000 characters. Built-in templates cannot be changed.",
  }, { status: 400 });
  try {
    return Response.json({ template: await changePromptTemplate(parsed.data) });
  } catch (err) {
    if (err instanceof TemplateNotFoundError) return Response.json({
      error: "This template was deleted in another tab. Save a copy to keep your prompt, or reload to refresh the list.",
    }, { status: 404 });
    throw err;
  }
}
