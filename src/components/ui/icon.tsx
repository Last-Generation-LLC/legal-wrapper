import { icons, type IconName } from "@/components/icons";
import { cn } from "@/lib/utils";

// Thin wrapper enforcing the handoff defaults (14px, 1.6 stroke, currentColor).
export function Icon({
  name,
  size = 14,
  strokeWidth = 1.6,
  className,
}: {
  name: IconName;
  size?: number;
  strokeWidth?: number;
  className?: string;
}) {
  const Glyph = icons[name];
  return (
    <Glyph
      size={size}
      strokeWidth={strokeWidth}
      className={cn("shrink-0", className)}
      aria-hidden
    />
  );
}
