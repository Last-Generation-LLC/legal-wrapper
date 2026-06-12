import { AssistantChat } from "@/components/assistant/assistant-chat";
import { modelFor } from "@/lib/anthropic";
import { modelDisplayLabel } from "@/lib/chat-ui";

// Server Component shell: derives the model pill label from the registry
// (single source of truth — the pill can't drift from the model actually
// called) and hands off to the client chat. The sidebar + DocsProvider live
// in the layout.
export default function AssistantPage() {
  return <AssistantChat modelLabel={modelDisplayLabel(modelFor("assistant"))} />;
}
