import { cn } from "@/lib/utils";
import { confidenceTone, type ConfidenceTone } from "@/lib/chat-ui";

// One contract, both tabs: the same threshold bands color the dot in the
// Assistant's message metadata and the Review grid's done cells.
const DOT_BG: Record<ConfidenceTone, string> = {
  ok: "bg-green",
  warn: "bg-amber",
  bad: "bg-red",
};

export function ConfidenceDot({
  confidence,
  className,
}: {
  confidence: number;
  className?: string;
}) {
  return (
    <span
      title="Document-support confidence"
      className={cn(
        "inline-block size-[7px] shrink-0 rounded-full",
        DOT_BG[confidenceTone(confidence)],
        className,
      )}
    />
  );
}
