import { cn } from "@/lib/utils";
import { Icon } from "./icon";
import { Btn } from "./btn";
import type { IconName } from "@/components/icons";

// One empty-state treatment shared by every "nothing here yet" surface (#18):
// a faint icon, a short heading, a dim hint, and an optional CTA. Centered,
// mono, on the project's existing token vocabulary so the four states read as
// one family.
export function EmptyState({
  icon,
  heading,
  hint,
  action,
  className,
}: {
  icon: IconName;
  heading: string;
  hint: string;
  action?: { label: string; icon?: IconName; onClick: () => void; disabled?: boolean };
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-3 px-6 py-16 text-center",
        className,
      )}
    >
      <Icon name={icon} size={22} strokeWidth={1.4} className="text-dim opacity-60" />
      <div className="space-y-1">
        <div className="font-mono text-[12px] font-medium text-muted-foreground">{heading}</div>
        <p className="mx-auto max-w-[260px] font-mono text-[10.5px] leading-relaxed text-dim">
          {hint}
        </p>
      </div>
      {action && (
        <Btn
          variant="default"
          size="sm"
          icon={action.icon}
          disabled={action.disabled}
          onClick={action.onClick}
          className="mt-1"
        >
          {action.label}
        </Btn>
      )}
    </div>
  );
}
