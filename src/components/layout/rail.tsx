"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon } from "@/components/ui/icon";
import type { IconName } from "@/components/icons";
import { cn } from "@/lib/utils";

const items: { href: string; label: string; icon: IconName }[] = [
  { href: "/assistant", label: "Assistant", icon: "chat" },
  { href: "/review", label: "Review", icon: "grid" },
  { href: "/documents", label: "Documents", icon: "folder" },
];

// 56px fixed nav. Logo "LLW" (Local Legal Wrapper wordmark) + three sections + settings.
// Active section = panelHi bg + full text color; inactive = dim.
export function Rail() {
  const pathname = usePathname();
  return (
    <nav className="flex w-14 shrink-0 flex-col items-stretch gap-0.5 border-r border-border bg-bg py-3.5">
      <div className="mx-2.5 mb-3.5 flex h-7 items-center justify-center rounded border border-border font-mono text-[10px] font-medium tracking-[0.08em] text-amber">
        LLW
      </div>
      {items.map((it) => {
        const active = pathname.startsWith(it.href);
        return (
          <Link
            key={it.href}
            href={it.href}
            aria-label={it.label}
            className={cn(
              "mx-2 flex h-10 flex-col items-center justify-center gap-[3px] rounded",
              active ? "bg-panel-hi text-foreground" : "text-dim",
            )}
          >
            <Icon name={it.icon} size={15} />
            <span className="font-mono text-[8.5px] uppercase tracking-[0.04em]">
              {it.label.slice(0, 4)}
            </span>
          </Link>
        );
      })}
      <div className="flex-1" />
      <div className="mx-2 flex h-10 items-center justify-center text-dim">
        <Icon name="settings" size={15} />
      </div>
    </nav>
  );
}
