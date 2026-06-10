import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

// Mirrors the handoff <Pill>: 2px/8px padding, 3px radius, 10.5px mono.
const pill = cva(
  "inline-flex items-center gap-1.5 rounded-[3px] border px-2 py-0.5 " +
    "font-mono text-[10.5px] font-medium leading-4 tracking-[0.02em]",
  {
    variants: {
      tone: {
        default: "bg-panel-hi text-muted-foreground border-border",
        active:
          "bg-[oklch(0.28_0.05_78_/_0.15)] text-amber border-[oklch(0.5_0.08_78_/_0.4)]",
        ctx: "bg-[oklch(0.22_0.02_240)] text-blue border-[oklch(0.4_0.08_240_/_0.5)]",
        ok: "bg-[oklch(0.24_0.04_150)] text-green border-[oklch(0.4_0.08_150_/_0.5)]",
        warn: "bg-[oklch(0.24_0.04_50)] text-amber border-[oklch(0.4_0.08_50_/_0.5)]",
      },
    },
    defaultVariants: { tone: "default" },
  },
);

export interface PillProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof pill> {}

export function Pill({ className, tone, children, ...props }: PillProps) {
  return (
    <span className={cn(pill({ tone }), className)} {...props}>
      {children}
    </span>
  );
}
