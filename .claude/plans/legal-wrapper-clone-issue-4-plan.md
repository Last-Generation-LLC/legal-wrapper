# Design System Port — Implementation Plan (Issue #4)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Port the `design_handoff_legal_wrapper/` design language (OKLCH dark warm-gray tokens, three fonts, small radii, the `Pill`/`Btn`/`Icon` primitives, and the `Rail`+`TopBar` layout shell) into the running Next.js app, with empty route stubs for Assistant / Review / Documents.

**Architecture:** Tailwind v4 is CSS-first — all theming lives in `src/app/globals.css` via `@theme`. We keep shadcn's light/`.dark` structure (per locked decision d1), put the handoff palette into the dark theme, expose the named brand tokens as `@theme` colors, and pin the app to dark via `<html className="dark">` so light mode stays a latent future toggle. Primitives are dedicated CVA components under `src/components/ui/` (matching the existing `button.tsx` pattern). The shell uses an App Router route group `(workspace)/` whose layout renders the persistent `Rail`; each page composes its own `TopBar`. The root route redirects to `/assistant`.

**Tech Stack:** Next.js 16 (App Router), React 19, Tailwind CSS v4, `class-variance-authority`, `lucide-react`, `next/font/google`, Vitest + `@testing-library/react` + jsdom.

**Locked Decisions covered:** d1 (token architecture — keep dual theme, force dark, palette unchanged), d2 (fonts via next/font), d3 (radius guard ~4px), d4 (route group + Rail via usePathname + root redirect), d5 (TopBar composable per page), d6 (dedicated CVA Pill/Btn/Icon), d7 (icons → lucide), d8 (route content = stubs), d9 (verify shadcn Button under dark tokens), d10 (responsive scope = shell only).

---

## File Structure

- `src/app/globals.css` — **modify.** Add handoff CSS vars, remap shadcn semantics to the dark palette, expose named `@theme` brand tokens, clamp `--radius`.
- `src/app/layout.tsx` — **modify.** Replace Geist with Inter Tight / Instrument Serif / JetBrains Mono via `next/font/google`; add `dark` class to `<html>`.
- `src/app/page.tsx` — **replace.** Becomes a server-side `redirect("/assistant")`.
- `src/components/icons.ts` — **create.** Semantic-name → `lucide-react` component map.
- `src/components/ui/icon.tsx` — **create.** Thin `<Icon>` wrapper (default size/stroke).
- `src/components/ui/btn.tsx` — **create.** CVA `Btn` (primary/default/ghost × sm/md, optional leading icon).
- `src/components/ui/pill.tsx` — **create.** CVA `Pill` (default/active/ctx/ok/warn).
- `src/components/layout/top-bar.tsx` — **create.** Presentational `TopBar` (crumbs + right slot).
- `src/components/layout/rail.tsx` — **create.** Client `Rail` (logo + 3 nav items + settings; active via `usePathname`).
- `src/app/(workspace)/layout.tsx` — **create.** Renders `Rail` + flex column shell.
- `src/app/(workspace)/assistant/page.tsx`, `review/page.tsx`, `documents/page.tsx` — **create.** Stub pages (TopBar + "coming soon").
- `src/test/setup-dom.ts` — **create.** Registers `@testing-library/jest-dom` matchers.
- `vitest.config.ts` — **modify.** Add `setupFiles`.
- Test files colocated as `*.test.tsx` next to each component.

---

## Task 1: Component test infrastructure

**Files:**
- Modify: `package.json` (devDeps), `vitest.config.ts`
- Create: `src/test/setup-dom.ts`

- [ ] **Step 1: Install jsdom + testing-library devDeps**

```bash
pnpm add -D @testing-library/react @testing-library/dom @testing-library/jest-dom jsdom
```

Expected: packages added to `devDependencies`.

- [ ] **Step 2: Create the jest-dom setup file**

Create `src/test/setup-dom.ts`:

```ts
// Registers @testing-library/jest-dom matchers (toBeInTheDocument, toHaveClass, …)
// for Vitest. Harmless for node-env tests; required for component (jsdom) tests.
import "@testing-library/jest-dom/vitest";
```

- [ ] **Step 3: Wire setupFiles into vitest.config.ts**

Read the current `vitest.config.ts`. Keep its `node` default environment and `@` alias; add `setupFiles`. The component test files opt into jsdom per-file with a `// @vitest-environment jsdom` docblock (Task 4+), so the node-env lib tests are unaffected.

```ts
import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    environment: "node",
    setupFiles: ["./src/test/setup-dom.ts"],
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
});
```

(Match the existing file's exact import style; only add `setupFiles`.)

- [ ] **Step 4: Run the existing suite to confirm nothing broke**

Run: `pnpm test`
Expected: the existing 31 tests still pass (jest-dom import is a no-op for them).

- [ ] **Step 5: Commit**

```bash
git add package.json pnpm-lock.yaml vitest.config.ts src/test/setup-dom.ts
git commit -m "test: add jsdom + testing-library for component tests"
```

---

## Task 2: Design tokens + radius clamp in globals.css (d1, d3)

**Files:**
- Modify: `src/app/globals.css`

This is CSS — there is no unit test for token values; correctness is verified by `next build` (Task 10) and a visual/contrast pass. The "test" here is a build + a grep assertion that the tokens exist.

- [ ] **Step 1: Add handoff brand tokens + remap dark semantics**

Edit `src/app/globals.css`. (a) In the `@theme inline { … }` block, add the named brand tokens (these generate `bg-panel`, `text-amber`, `border-border-soft`, etc.) alongside the existing shadcn mappings:

```css
  /* --- Handoff named brand tokens (added) --- */
  --color-bg: var(--bg);
  --color-panel: var(--panel);
  --color-panel-hi: var(--panel-hi);
  --color-border-soft: var(--border-soft);
  --color-amber: var(--amber);
  --color-amber-dim: var(--amber-dim);
  --color-green: var(--good);
  --color-red: var(--bad);
  --color-blue: var(--info);
  --color-dim: var(--dim);
  --font-serif: var(--font-serif);
```

(b) Define the brand accent values **once at `:root`** so they are theme-independent (amber is amber in light or dark — this is what keeps light mode a clean future toggle per d1). Add to the `:root { … }` block:

```css
  --amber: oklch(0.80 0.13 78);
  --amber-dim: oklch(0.55 0.09 78);
  --good: oklch(0.78 0.12 150);
  --bad: oklch(0.72 0.15 25);
  --info: oklch(0.72 0.10 240);
```

(c) In the `.dark { … }` block, define the surface/text ramp with the exact handoff OKLCH values AND remap the shadcn semantic vars onto them (so shadcn components render native to the dark theme — the d9 concern):

```css
  /* Handoff surface + text ramp */
  --bg: oklch(0.16 0.005 60);
  --panel: oklch(0.195 0.006 60);
  --panel-hi: oklch(0.225 0.006 60);
  --border-soft: oklch(0.24 0.006 60);
  --text: oklch(0.96 0.002 60);
  --dim: oklch(0.48 0.005 60);

  /* Remap shadcn semantics onto the handoff palette */
  --background: var(--bg);
  --foreground: var(--text);
  --card: var(--panel);
  --card-foreground: var(--text);
  --popover: var(--panel);
  --popover-foreground: var(--text);
  --primary: var(--text);            /* primary Btn = light bg … */
  --primary-foreground: var(--bg);   /* … dark text (matches handoff) */
  --secondary: var(--panel-hi);
  --secondary-foreground: var(--text);
  --muted: var(--panel-hi);
  --muted-foreground: oklch(0.68 0.005 60); /* handoff `muted` (secondary text) */
  --accent: var(--panel-hi);
  --accent-foreground: var(--text);
  --destructive: var(--bad);
  --border: oklch(0.285 0.006 60);   /* handoff `border` */
  --input: oklch(0.285 0.006 60);
  --ring: var(--amber);
```

Leave the existing `:root` light surface values (the shadcn neutral defaults) untouched — light mode stays defined but unused.

- [ ] **Step 2: Clamp the radius (d3)**

In `:root`, change the radius from `0.625rem` to a small value so shadcn-derived radii stay in the 3–4px band:

```css
  --radius: 0.25rem; /* 4px — handoff is 3–4px everywhere; no large rounded corners */
```

- [ ] **Step 3: Verify the tokens compile and exist**

Run: `pnpm exec next build` (or `pnpm build`)
Expected: build succeeds. Then assert the tokens are present:

Run: `grep -E -- '--color-amber|--radius: 0.25rem|--panel-hi' src/app/globals.css`
Expected: all three lines print.

- [ ] **Step 4: Commit**

```bash
git add src/app/globals.css
git commit -m "feat: port handoff OKLCH palette + clamp radius (d1, d3)"
```

---

## Task 3: Fonts + force dark in layout.tsx (d2, d1)

**Files:**
- Modify: `src/app/layout.tsx`

- [ ] **Step 1: Replace Geist with the three handoff fonts and force dark**

Rewrite `src/app/layout.tsx`:

```tsx
import type { Metadata } from "next";
import { Inter_Tight, Instrument_Serif, JetBrains_Mono } from "next/font/google";
import "./globals.css";

// next/font self-hosts these at build time (satisfies the "self-host in
// production" handoff note). Each sets a CSS variable consumed by @theme.
const sans = Inter_Tight({
  variable: "--font-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});
const serif = Instrument_Serif({
  variable: "--font-serif",
  subsets: ["latin"],
  weight: "400",
  style: ["normal", "italic"], // Instrument Serif ships only weight 400
});
const mono = JetBrains_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

export const metadata: Metadata = {
  title: "Legal Document Workspace",
  description: "Local-first legal document workspace built on the Claude API.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      // `dark` pins the app to the dark theme now; the light theme stays
      // defined-but-unused so a future toggle is a one-line change (d1).
      className={`dark ${sans.variable} ${serif.variable} ${mono.variable} h-full antialiased`}
    >
      <body className="bg-bg text-foreground min-h-full flex flex-col">
        {children}
      </body>
    </html>
  );
}
```

- [ ] **Step 2: Ensure @theme maps the mono/sans/serif variables**

Confirm `globals.css` `@theme inline` has `--font-sans: var(--font-sans)`, `--font-mono: var(--font-mono)`, and `--font-serif: var(--font-serif)` (the serif line was added in Task 2; fix `--font-mono` if it still points at the old `--font-geist-mono`). Update `--font-mono: var(--font-mono);` if needed.

- [ ] **Step 3: Verify**

Run: `pnpm exec tsc --noEmit`
Expected: no type errors.
Run: `pnpm exec next build`
Expected: build succeeds and downloads the three fonts.

- [ ] **Step 4: Commit**

```bash
git add src/app/layout.tsx src/app/globals.css
git commit -m "feat: load Inter Tight / Instrument Serif / JetBrains Mono; force dark (d2, d1)"
```

---

## Task 4: Icon mapping + primitive (d7)

**Files:**
- Create: `src/components/icons.ts`, `src/components/ui/icon.tsx`
- Test: `src/components/ui/icon.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `src/components/ui/icon.test.tsx`:

```tsx
// @vitest-environment jsdom
import { render } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { Icon } from "./icon";

describe("Icon", () => {
  it("renders an svg for a mapped name", () => {
    const { container } = render(<Icon name="chat" />);
    expect(container.querySelector("svg")).toBeInTheDocument();
  });

  it("applies the requested size", () => {
    const { container } = render(<Icon name="grid" size={20} />);
    const svg = container.querySelector("svg")!;
    expect(svg).toHaveAttribute("width", "20");
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `pnpm test src/components/ui/icon.test.tsx`
Expected: FAIL (cannot resolve `./icon`).

- [ ] **Step 3: Create the lucide mapping**

Create `src/components/icons.ts` (verify each name resolves against the installed `lucide-react` ^1.17; substitute the nearest match if any drifted):

```ts
import {
  MessageSquare, LayoutGrid, FileText, Folder, Upload, Settings,
  Send, Plus, Play, Check, X, ChevronDown, ChevronRight, Download,
  Eye, Pencil, RefreshCw, Copy, Sparkles, Search, Filter, Square, Lock,
  type LucideIcon,
} from "lucide-react";

// Semantic handoff name → lucide component. Consumers reference by name so the
// icon set is swappable in one place.
export const icons = {
  chat: MessageSquare,
  grid: LayoutGrid,
  doc: FileText,
  folder: Folder,
  upload: Upload,
  settings: Settings,
  send: Send,
  plus: Plus,
  play: Play,
  check: Check,
  x: X,
  chevDown: ChevronDown,
  chevRight: ChevronRight,
  download: Download,
  eye: Eye,
  edit: Pencil,
  refresh: RefreshCw,
  copy: Copy,
  sparkle: Sparkles,
  search: Search,
  filter: Filter,
  stop: Square,
  lock: Lock,
} satisfies Record<string, LucideIcon>;

export type IconName = keyof typeof icons;
```

- [ ] **Step 4: Create the Icon wrapper**

Create `src/components/ui/icon.tsx`:

```tsx
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
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `pnpm test src/components/ui/icon.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 6: Commit**

```bash
git add src/components/icons.ts src/components/ui/icon.tsx src/components/ui/icon.test.tsx
git commit -m "feat: Icon primitive + lucide mapping (d7)"
```

---

## Task 5: Btn primitive (d6)

**Files:**
- Create: `src/components/ui/btn.tsx`
- Test: `src/components/ui/btn.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `src/components/ui/btn.test.tsx`:

```tsx
// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { Btn } from "./btn";

describe("Btn", () => {
  it("renders its children", () => {
    render(<Btn>Send</Btn>);
    expect(screen.getByRole("button", { name: "Send" })).toBeInTheDocument();
  });

  it("primary variant uses the primary token classes", () => {
    render(<Btn variant="primary">Run</Btn>);
    expect(screen.getByRole("button", { name: "Run" })).toHaveClass("bg-primary");
  });

  it("sm size sets the short height", () => {
    render(<Btn size="sm">x</Btn>);
    expect(screen.getByRole("button")).toHaveClass("h-6");
  });

  it("renders a leading icon when given one", () => {
    const { container } = render(<Btn icon="plus">Add</Btn>);
    expect(container.querySelector("svg")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `pnpm test src/components/ui/btn.test.tsx`
Expected: FAIL (cannot resolve `./btn`).

- [ ] **Step 3: Implement Btn**

Create `src/components/ui/btn.tsx`:

```tsx
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
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm test src/components/ui/btn.test.tsx`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/components/ui/btn.tsx src/components/ui/btn.test.tsx
git commit -m "feat: Btn primitive (d6)"
```

---

## Task 6: Pill primitive (d6)

**Files:**
- Create: `src/components/ui/pill.tsx`
- Test: `src/components/ui/pill.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `src/components/ui/pill.test.tsx`:

```tsx
// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { Pill } from "./pill";

describe("Pill", () => {
  it("renders children", () => {
    render(<Pill>OPUS 4.8</Pill>);
    expect(screen.getByText("OPUS 4.8")).toBeInTheDocument();
  });

  it("ctx tone uses the blue text token", () => {
    render(<Pill tone="ctx">ctx</Pill>);
    expect(screen.getByText("ctx")).toHaveClass("text-blue");
  });

  it("ok tone uses the green text token", () => {
    render(<Pill tone="ok">done</Pill>);
    expect(screen.getByText("done")).toHaveClass("text-green");
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `pnpm test src/components/ui/pill.test.tsx`
Expected: FAIL (cannot resolve `./pill`).

- [ ] **Step 3: Implement Pill**

Create `src/components/ui/pill.tsx`. Tints are the handoff's accent-over-panel values, written as Tailwind arbitrary values (spaces → underscores):

```tsx
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
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm test src/components/ui/pill.test.tsx`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/components/ui/pill.tsx src/components/ui/pill.test.tsx
git commit -m "feat: Pill primitive (d6)"
```

---

## Task 7: TopBar (d5)

**Files:**
- Create: `src/components/layout/top-bar.tsx`
- Test: `src/components/layout/top-bar.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `src/components/layout/top-bar.test.tsx`:

```tsx
// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { TopBar } from "./top-bar";

describe("TopBar", () => {
  it("renders each breadcrumb", () => {
    render(<TopBar crumbs={["~/workspaces", "Aperture", "Assistant"]} />);
    expect(screen.getByText("Aperture")).toBeInTheDocument();
    expect(screen.getByText("Assistant")).toBeInTheDocument();
  });

  it("renders the right slot", () => {
    render(<TopBar crumbs={["x"]} right={<button>Run all</button>} />);
    expect(screen.getByRole("button", { name: "Run all" })).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `pnpm test src/components/layout/top-bar.test.tsx`
Expected: FAIL (cannot resolve `./top-bar`).

- [ ] **Step 3: Implement TopBar**

Create `src/components/layout/top-bar.tsx` (presentational; each page passes its own crumbs + right cluster per d5):

```tsx
import * as React from "react";

// 44px breadcrumb bar. `crumbs` render left (last is emphasized); `right` is a
// per-page slot (model pill, action buttons). Lives in the page, not the layout.
export function TopBar({
  crumbs,
  right,
}: {
  crumbs: string[];
  right?: React.ReactNode;
}) {
  return (
    <div className="flex h-11 shrink-0 items-center gap-3 border-b border-border bg-bg px-4">
      <div className="flex min-w-0 flex-1 items-center gap-2">
        {crumbs.map((c, i) => (
          <React.Fragment key={i}>
            {i > 0 && <span className="text-[11px] text-dim">/</span>}
            <span
              className={
                "truncate font-mono text-[11.5px] tracking-[0.01em] " +
                (i === crumbs.length - 1 ? "text-foreground" : "text-muted-foreground")
              }
            >
              {c}
            </span>
          </React.Fragment>
        ))}
      </div>
      {right}
    </div>
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm test src/components/layout/top-bar.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/components/layout/top-bar.tsx src/components/layout/top-bar.test.tsx
git commit -m "feat: TopBar layout component (d5)"
```

---

## Task 8: Rail (d4)

**Files:**
- Create: `src/components/layout/rail.tsx`
- Test: `src/components/layout/rail.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `src/components/layout/rail.test.tsx`. Mock `next/navigation`'s `usePathname` to drive the active state:

```tsx
// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";

vi.mock("next/navigation", () => ({ usePathname: () => "/review" }));

import { Rail } from "./rail";

describe("Rail", () => {
  it("marks the active section based on the pathname", () => {
    render(<Rail />);
    // The Review link is active → carries the panel-hi background class.
    const review = screen.getByRole("link", { name: /review/i });
    expect(review).toHaveClass("bg-panel-hi");
    const assistant = screen.getByRole("link", { name: /assistant/i });
    expect(assistant).not.toHaveClass("bg-panel-hi");
  });

  it("links to the three workspace routes", () => {
    render(<Rail />);
    expect(screen.getByRole("link", { name: /assistant/i })).toHaveAttribute("href", "/assistant");
    expect(screen.getByRole("link", { name: /review/i })).toHaveAttribute("href", "/review");
    expect(screen.getByRole("link", { name: /documents/i })).toHaveAttribute("href", "/documents");
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `pnpm test src/components/layout/rail.test.tsx`
Expected: FAIL (cannot resolve `./rail`).

- [ ] **Step 3: Implement Rail**

Create `src/components/layout/rail.tsx` (client component — needs `usePathname`):

```tsx
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
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm test src/components/layout/rail.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/components/layout/rail.tsx src/components/layout/rail.test.tsx
git commit -m "feat: Rail nav with active-route highlight (d4)"
```

---

## Task 9: Workspace layout + route stubs + root redirect (d4, d8)

**Files:**
- Create: `src/app/(workspace)/layout.tsx`, `src/app/(workspace)/assistant/page.tsx`, `src/app/(workspace)/review/page.tsx`, `src/app/(workspace)/documents/page.tsx`
- Replace: `src/app/page.tsx`
- Test: `src/app/page.test.tsx`

- [ ] **Step 1: Write the failing test for the root redirect**

Create `src/app/page.test.tsx`:

```tsx
// @vitest-environment node
import { describe, it, expect, vi } from "vitest";

const redirect = vi.fn();
vi.mock("next/navigation", () => ({ redirect: (...a: unknown[]) => redirect(...a) }));

import Home from "./page";

describe("root route", () => {
  it("redirects to /assistant", () => {
    Home();
    expect(redirect).toHaveBeenCalledWith("/assistant");
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `pnpm test src/app/page.test.tsx`
Expected: FAIL (current `page.tsx` renders the scaffold, never calls redirect).

- [ ] **Step 3: Replace the root page with a redirect**

Replace `src/app/page.tsx` entirely:

```tsx
import { redirect } from "next/navigation";

// The app opens on the Assistant. The root path has no UI of its own.
export default function Home() {
  redirect("/assistant");
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm test src/app/page.test.tsx`
Expected: PASS.

- [ ] **Step 5: Create the workspace group layout**

Create `src/app/(workspace)/layout.tsx` (the `(workspace)` parentheses group the three routes under a shared shell without adding a URL segment):

```tsx
import { Rail } from "@/components/layout/rail";

// Persistent shell for the three workspace sections: fixed Rail on the left,
// flexible main column on the right. The TopBar is composed per page (d5).
export default function WorkspaceLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex h-full flex-1">
      <Rail />
      <div className="flex min-w-0 flex-1 flex-col">{children}</div>
    </div>
  );
}
```

- [ ] **Step 6: Create the three stub pages (d8)**

Each renders its own `TopBar` + a "coming soon" main region. Create `src/app/(workspace)/assistant/page.tsx`:

```tsx
import { TopBar } from "@/components/layout/top-bar";

export default function AssistantPage() {
  return (
    <>
      <TopBar crumbs={["~/workspaces", "Assistant"]} />
      <main className="flex flex-1 items-center justify-center text-[12.5px] text-dim">
        Assistant — coming soon
      </main>
    </>
  );
}
```

Create `src/app/(workspace)/review/page.tsx` (same shape, crumbs `["~/workspaces", "Review"]`, text `Review — coming soon`) and `src/app/(workspace)/documents/page.tsx` (crumbs `["~/workspaces", "Documents"]`, text `Documents — coming soon`).

- [ ] **Step 7: Verify routing builds and the suite passes**

Run: `pnpm exec tsc --noEmit` → no errors.
Run: `pnpm exec next build` → succeeds; confirm `/assistant`, `/review`, `/documents` appear in the route output and `/` is a redirect.
Run: `pnpm test` → all green.

- [ ] **Step 8: Commit**

```bash
git add "src/app/(workspace)" src/app/page.tsx src/app/page.test.tsx
git commit -m "feat: workspace route group + stubs + root redirect (d4, d8)"
```

---

## Task 10: Responsive shell pass + final verification & audits (d10, d3, d9)

**Files:**
- Possibly modify: `src/app/(workspace)/layout.tsx` (only if the responsive pass needs it)

This task carries the three "verify" decisions: responsive scope is shell-only (d10), radius audit (d3), and confirm shadcn components survive the retheme (d9).

- [ ] **Step 1: Confirm the shell is responsive within scope (d10)**

The only responsive requirement for this task is that the shell holds: the Rail persists and the main column flexes/scrolls; the sidebar-drawer (#5) and stacked-inspector (#12) behaviors are explicitly out of scope. Verify the shell does not overflow horizontally at narrow widths — the flex row + `min-w-0` on the main column already handle this. No new breakpoints are added in this task.

Run `pnpm dev` and resize the window (or use responsive devtools) from ~1440px down to ~768px; confirm the Rail stays put and the main region reflows without horizontal scroll.

- [ ] **Step 2: Radius audit (d3)**

Run: `grep -rE 'rounded-(lg|xl|2xl|3xl|full)' src/components src/app`
Expected: **no matches** in the primitives/shell authored here (the bespoke components use `rounded-[3px]` / `rounded`). If a match appears, replace it with `rounded-[3px]` or `rounded` (≤4px). Note: `src/components/ui/button.tsx` (the untouched shadcn baseline) may still use `rounded-md`, which now resolves to ~3.2px via the clamped `--radius` — acceptable.

- [ ] **Step 3: Verify shadcn Button under the dark tokens (d9)**

The shadcn `button.tsx` is unused by the shell but must still render correctly under the rethemed tokens. Add a throwaway check: temporarily import `Button` into the Assistant stub, run `pnpm dev`, and confirm the default and `primary`-equivalent variants are legible (light text on dark surfaces; primary = light bg / dark text). Remove the throwaway import before committing. (No test artifact — this is a one-time visual confirmation of the d9 risk.)

- [ ] **Step 4: Full green gate**

Run: `pnpm exec tsc --noEmit` → no errors.
Run: `pnpm test` → all suites pass (the original 31 + the new component/redirect tests).
Run: `pnpm exec next build` → succeeds.

- [ ] **Step 5: Commit any responsive/radius fixes**

```bash
git add -A
git commit -m "chore: responsive shell pass + radius/retheme audit (d10, d3, d9)"
```

(If Steps 1–3 required no code changes, skip the commit and note that in the execution summary.)

---

## Self-Review (run before handing off)

- **Decision coverage:** d1 → Tasks 2+3; d2 → Task 3; d3 → Tasks 2+10; d4 → Tasks 8+9; d5 → Task 7; d6 → Tasks 5+6; d7 → Task 4; d8 → Task 9; d9 → Task 10; d10 → Task 10. All 10 covered.
- **Type consistency:** `Icon` takes `name: IconName`; `Btn` takes `icon?: IconName` and `variant`/`size`; `Pill` takes `tone`; `TopBar` takes `crumbs: string[]` + `right?: ReactNode`; `Rail` takes no props. These signatures are used consistently across tasks.
- **No placeholders:** every code/step block is concrete.
