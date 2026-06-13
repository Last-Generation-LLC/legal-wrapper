import { ReviewScreen } from "@/components/review/review-screen";
import { modelFor } from "@/lib/anthropic";
import { modelDisplayLabel } from "@/lib/chat-ui";

// Server Component shell: the model pill label comes from the registry
// (single source of truth — the pill can't drift from the model the cell
// route actually calls) and the client screen does the rest.
export default function ReviewPage() {
  return (
    <ReviewScreen
      modelLabel={modelDisplayLabel(modelFor("review"))}
      modelId={modelFor("review")}
    />
  );
}
