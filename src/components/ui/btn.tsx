import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";
import { Icon } from "./icon";
import type { IconName } from "@/components/icons";

// Mirrors the handoff <Btn>: primary = light bg/dark text, default = panelHi,
// ghost = transparent. Radii kept at 3px (d3). Sizes sm=24px / md=30px.
const btn = cva(
  "inline-flex items-center gap-1.5 rounded-[3px] border font-sans font-medium " +
    "tracking-[-0.005em] cursor-pointer disabled:cursor-not-allowed disabled:opacity-40",
  {
    variants: {
      variant: {
        primary: "bg-primary text-primary-foreground border-primary",
        default: "bg-panel-hi text-foreground border-border",
        ghost: "bg-transparent text-foreground border-transparent",
      },
      size: {
        sm: "h-6 px-2 text-[11.5px]",
        md: "h-[30px] px-3 text-[12.5px]",
      },
    },
    defaultVariants: { variant: "default", size: "md" },
  },
);

export interface BtnProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof btn> {
  icon?: IconName;
}

export function Btn({ className, variant, size, icon, children, ...props }: BtnProps) {
  return (
    <button className={cn(btn({ variant, size }), className)} {...props}>
      {icon && <Icon name={icon} size={13} />}
      {children}
    </button>
  );
}
