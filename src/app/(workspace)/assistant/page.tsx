import { AssistantChat } from "@/components/assistant/assistant-chat";
import { modelFor } from "@/lib/anthropic";
import { loadActiveThread } from "@/lib/chat-store";
import { modelDisplayLabel } from "@/lib/chat-ui";

// loadActiveThread touches SQLite — never prerender at build time.
export const dynamic = "force-dynamic";

// Server Component shell: derives the model pill label from the registry
// (single source of truth — the pill can't drift from the model actually
// called) and seeds the client chat with the persisted thread (#22). The
// sidebar + DocsProvider live in the layout.
export default async function AssistantPage() {
  const thread = await loadActiveThread();
  // Resolve once so the label pill and the pricing lookup can never disagree
  // about which model was actually called.
  const model = modelFor("assistant");
  return (
    <AssistantChat
      modelLabel={modelDisplayLabel(model)}
      modelId={model}
      initialMessages={thread.messages}
    />
  );
}
