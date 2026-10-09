import { ReviewScreen } from "@/components/review/review-screen";
import { modelFor, REVIEW_MODEL_IDS } from "@/lib/anthropic";
import { modelDisplayLabel } from "@/lib/chat-ui";
import { formatRateCard } from "@/lib/pricing";

// Server Component shell: the model picker's options come from the registry
// (single source of truth — the picker can't offer a model the cell route
// would reject) and the client screen does the rest.
export default function ReviewPage() {
  return (
    <ReviewScreen
      modelOptions={REVIEW_MODEL_IDS.map((id) => ({
        id,
        label: modelDisplayLabel(id),
        rates: formatRateCard(id),
      }))}
      defaultModelId={modelFor("review")}
    />
  );
}
