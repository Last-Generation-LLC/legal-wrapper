import { archiveActiveSession } from "@/lib/chat-store";

// Prisma is Node-only — never the Edge runtime.
export const runtime = "nodejs";

// "New session" (#22): archive the active thread (never delete — #26 will
// browse the archive) and start a fresh one. POST because it mutates;
// idempotent in effect (archiving an empty fresh session just makes another).
export async function POST() {
  const fresh = await archiveActiveSession();
  return Response.json({ sessionId: fresh.id });
}
