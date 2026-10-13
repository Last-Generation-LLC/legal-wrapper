import { z } from "zod";
import { changeSession, listSessions, renameSession, SessionConflictError, SessionNotFoundError } from "@/lib/chat-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const selection = {
  currentSessionId: z.string().min(1),
  selectedDocIds: z.array(z.string().min(1)),
};
const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("new"), ...selection }),
  z.object({ action: z.literal("open"), sessionId: z.string().min(1), ...selection }),
  z.object({ action: z.literal("delete"), sessionId: z.string().min(1), ...selection }),
  z.object({ action: z.literal("rename"), sessionId: z.string().min(1), title: z.string().trim().min(1).max(120) }),
]);

export async function GET() {
  return Response.json(await listSessions());
}

export async function POST(request: Request) {
  let body: unknown;
  try { body = await request.json(); }
  catch { return Response.json({ error: "Body must be JSON." }, { status: 400 }); }
  const parsed = schema.safeParse(body);
  if (!parsed.success) return Response.json({ error: "Invalid session request. Names must be 1–120 characters." }, { status: 400 });
  const data = parsed.data;
  try {
    if (data.action === "rename") {
      await renameSession(data.sessionId, data.title);
      return Response.json({ thread: null });
    }
    const thread = await changeSession(data, data.currentSessionId, data.selectedDocIds);
    return Response.json({ thread });
  } catch (err) {
    if (err instanceof SessionNotFoundError) return Response.json({ error: "Session not found. Refresh the session list." }, { status: 404 });
    if (err instanceof SessionConflictError) return Response.json({ error: "The active session changed in another tab. Reload to continue." }, { status: 409 });
    throw err;
  }
}
