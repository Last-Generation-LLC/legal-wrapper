# Cost + Cache Surfacing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show real per-message cost + cache-hit % on the Assistant strip and per-run cost + cache % on the Review header, derived from live API usage fields, with all pricing constants in one config module — and enable prompt caching on the Assistant so its cache figure is meaningful.

**Architecture:** A new pure, client-safe `src/lib/pricing.ts` is the single source of pricing truth: one canonical `TokenUsage` shape, the verified per-model rates, the cache multipliers, and the cost / cache-rate / format functions. Both API routes emit usage in that one canonical shape (the raw SDK and the AI SDK report cache tokens with *opposite* conventions, so normalization happens at each route where the raw fields are unambiguous). The Assistant route additionally puts one `cacheControl` breakpoint on its document-bearing system prompt so multi-turn chats get real cache hits. The two screens compute their figures from real usage and the model id (passed down from the server pages, which already call the model seam) — no SDK import reaches the client, and the model registry is not duplicated.

**Tech Stack:** Next.js 16 App Router, TypeScript, `@anthropic-ai/sdk` (raw, Review route), `@ai-sdk/anthropic` 3.0.83 + `ai` 6.0.202 (streaming, Assistant route), vitest + @testing-library/react, Tailwind v4.

---

## Verified facts (do not re-derive; confirmed against live docs + installed source on 2026-06-13)

**Pricing — per million tokens** (platform.claude.com/docs/about-claude/pricing):

| Model id | input $/MTok | output $/MTok |
|---|---|---|
| `claude-opus-4-8` (Assistant) | 5 | 25 |
| `claude-sonnet-4-6` (Review) | 3 | 15 |

**Cache multipliers** (× base input rate): 5-minute cache **write = 1.25×**, cache **read = 0.1×**. (1-hour write is 2× — not used; both routes use the default 5-minute ephemeral TTL.)

**Usage field semantics — the load-bearing gotcha:**
- **Raw SDK** (`message.usage`, Review cell route): `input_tokens` is the **uncached** count *only*. Total input = `input_tokens + cache_read_input_tokens + cache_creation_input_tokens`.
- **AI SDK** (`@ai-sdk/anthropic` 3.0.83, Assistant route): the public `usage.inputTokens` is the **total, including cache** (`= noCache + cacheRead + cacheWrite` — confirmed in `convert-anthropic-messages-usage`). `usage.cachedInputTokens` is the cache-**read** subset. The cache-**write** count is *not* in `usage`; it is in `providerMetadata.anthropic.cacheCreationInputTokens` (number | null).
- In the AI SDK UI-message stream, the `finish-step` part carries both `usage` and `providerMetadata`; the `finish` part carries `totalUsage` but **no** providerMetadata. So cache-write must be read from `finish-step` (live path) or `await result.providerMetadata` (persistence path).

**AI SDK cache breakpoint syntax:** a system `ModelMessage` with `providerOptions: { anthropic: { cacheControl: { type: "ephemeral" } } }` (camelCase `cacheControl`).

**Canonical usage shape** used everywhere downstream (defined in `pricing.ts`):
```ts
type TokenUsage = {
  uncachedInputTokens: number;   // billed 1.0× base input
  cacheReadInputTokens: number;  // billed 0.1× base input
  cacheWriteInputTokens: number; // billed 1.25× base input (5-min TTL)
  outputTokens: number;          // billed output rate
};
```

**No client SDK leak:** no client component imports `@/lib/anthropic` today (verified). The server pages (`assistant/page.tsx`, `review/page.tsx`) already call `modelFor(role)`; they pass a `modelId` string prop to the client screens. `pricing.ts` imports nothing server-only.

---

### Task 1: Pricing module (pure, client-safe foundation)

**Files:**
- Create: `src/lib/pricing.ts`
- Test: `src/lib/pricing.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// src/lib/pricing.test.ts
import { describe, expect, it } from "vitest";
import {
  cacheHitRate,
  formatCachePct,
  formatUsd,
  sumUsage,
  usageCostUsd,
  type TokenUsage,
} from "@/lib/pricing";

const zero: TokenUsage = {
  uncachedInputTokens: 0,
  cacheReadInputTokens: 0,
  cacheWriteInputTokens: 0,
  outputTokens: 0,
};

describe("usageCostUsd", () => {
  it("prices uncached input, output, and the two cache tiers (sonnet)", () => {
    // sonnet: $3 in / $15 out per MTok. read 0.1x, write 1.25x.
    const usage: TokenUsage = {
      uncachedInputTokens: 1000,
      cacheReadInputTokens: 2000,
      cacheWriteInputTokens: 500,
      outputTokens: 100,
    };
    // 1000*3e-6 + 2000*3e-6*0.1 + 500*3e-6*1.25 + 100*15e-6
    expect(usageCostUsd(usage, "claude-sonnet-4-6")).toBeCloseTo(0.006975, 9);
  });

  it("prices opus rates", () => {
    const usage: TokenUsage = { ...zero, uncachedInputTokens: 1_000_000, outputTokens: 1_000_000 };
    expect(usageCostUsd(usage, "claude-opus-4-8")).toBeCloseTo(30, 6); // $5 + $25
  });

  it("returns 0 for an unknown model rather than a wrong number", () => {
    expect(usageCostUsd({ ...zero, uncachedInputTokens: 1000 }, "no-such-model")).toBe(0);
  });
});

describe("cacheHitRate", () => {
  it("is cacheRead over total input", () => {
    expect(
      cacheHitRate({ uncachedInputTokens: 100, cacheReadInputTokens: 900, cacheWriteInputTokens: 0, outputTokens: 50 }),
    ).toBeCloseTo(0.9, 6);
  });
  it("counts cache writes in the denominator (a write is not a hit)", () => {
    expect(
      cacheHitRate({ uncachedInputTokens: 0, cacheReadInputTokens: 0, cacheWriteInputTokens: 1000, outputTokens: 0 }),
    ).toBe(0);
  });
  it("is 0 when there is no input at all", () => {
    expect(cacheHitRate(zero)).toBe(0);
  });
});

describe("sumUsage", () => {
  it("adds element-wise", () => {
    const a: TokenUsage = { uncachedInputTokens: 1, cacheReadInputTokens: 2, cacheWriteInputTokens: 3, outputTokens: 4 };
    const b: TokenUsage = { uncachedInputTokens: 10, cacheReadInputTokens: 20, cacheWriteInputTokens: 30, outputTokens: 40 };
    expect(sumUsage([a, b])).toEqual({
      uncachedInputTokens: 11,
      cacheReadInputTokens: 22,
      cacheWriteInputTokens: 33,
      outputTokens: 44,
    });
  });
  it("returns a zero usage for an empty list", () => {
    expect(sumUsage([])).toEqual(zero);
  });
});

describe("formatUsd", () => {
  it("shows two decimals at or above $1", () => {
    expect(formatUsd(1.2)).toBe("$1.20");
  });
  it("shows four decimals below $1 (the point is that the cost is tiny)", () => {
    expect(formatUsd(0.0123)).toBe("$0.0123");
  });
  it("floors a sub-fraction-of-a-cent value to a marker", () => {
    expect(formatUsd(0.00005)).toBe("<$0.0001");
  });
  it("renders an exact zero plainly", () => {
    expect(formatUsd(0)).toBe("$0.00");
  });
});

describe("formatCachePct", () => {
  it("rounds to a whole percent", () => {
    expect(formatCachePct(0.876)).toBe("88%");
    expect(formatCachePct(0)).toBe("0%");
  });
});
```

- [ ] **Step 2: Run the tests to confirm they fail**

Run: `pnpm vitest run src/lib/pricing.test.ts`
Expected: FAIL — `Cannot find module '@/lib/pricing'`.

- [ ] **Step 3: Implement `src/lib/pricing.ts`**

```ts
// src/lib/pricing.ts
//
// The single source of pricing truth (locked AC: "pricing constants live in one
// config spot, easy to update"). Pure and client-safe: NO server-only imports
// (no @anthropic-ai/sdk, no @ai-sdk/anthropic), so both the Assistant and Review
// client screens can compute cost without pulling the SDK into the browser
// bundle. Rates verified against live Anthropic pricing docs (2026-06).

/** The canonical usage shape both API routes normalize to. Field meanings are
 *  unambiguous here, unlike the two SDKs' raw `inputTokens` (which disagree on
 *  whether cache tokens are included). */
export type TokenUsage = {
  /** Input tokens billed at the full base rate (cache miss / not cacheable). */
  uncachedInputTokens: number;
  /** Input tokens served from cache — billed at 0.1× base input. */
  cacheReadInputTokens: number;
  /** Input tokens written to the cache this call — billed at 1.25× base input (5-min TTL). */
  cacheWriteInputTokens: number;
  /** Generated output tokens. */
  outputTokens: number;
};

/** Cache pricing multipliers relative to the base input rate (verified 2026-06). */
export const CACHE_WRITE_5M_MULTIPLIER = 1.25;
export const CACHE_READ_MULTIPLIER = 0.1;

export type ModelPricing = { inputPerMTok: number; outputPerMTok: number };

/**
 * Per-model rates in USD per million tokens. Keyed by the exact model id the
 * registry (`@/lib/anthropic` MODELS) resolves — update both together if a
 * model is swapped. Cache-tier rates are DERIVED from these via the multipliers
 * above, so there is exactly one number per (model, tier) to maintain.
 */
export const MODEL_PRICING: Record<string, ModelPricing> = {
  "claude-opus-4-8": { inputPerMTok: 5, outputPerMTok: 25 },
  "claude-sonnet-4-6": { inputPerMTok: 3, outputPerMTok: 15 },
};

/** Dollar cost of one usage record for a given model id. Unknown model → 0
 *  (show no estimate rather than a confidently wrong one). */
export function usageCostUsd(usage: TokenUsage, modelId: string): number {
  const p = MODEL_PRICING[modelId];
  if (!p) return 0;
  const inRate = p.inputPerMTok / 1_000_000;
  const outRate = p.outputPerMTok / 1_000_000;
  return (
    usage.uncachedInputTokens * inRate +
    usage.cacheReadInputTokens * inRate * CACHE_READ_MULTIPLIER +
    usage.cacheWriteInputTokens * inRate * CACHE_WRITE_5M_MULTIPLIER +
    usage.outputTokens * outRate
  );
}

/** Fraction of input tokens served from cache (0..1). 0 when there is no input. */
export function cacheHitRate(usage: TokenUsage): number {
  const input =
    usage.uncachedInputTokens + usage.cacheReadInputTokens + usage.cacheWriteInputTokens;
  return input === 0 ? 0 : usage.cacheReadInputTokens / input;
}

const ZERO_USAGE: TokenUsage = {
  uncachedInputTokens: 0,
  cacheReadInputTokens: 0,
  cacheWriteInputTokens: 0,
  outputTokens: 0,
};

/** Element-wise sum — used for the Review grid's per-run aggregate. */
export function sumUsage(usages: TokenUsage[]): TokenUsage {
  return usages.reduce(
    (acc, u) => ({
      uncachedInputTokens: acc.uncachedInputTokens + u.uncachedInputTokens,
      cacheReadInputTokens: acc.cacheReadInputTokens + u.cacheReadInputTokens,
      cacheWriteInputTokens: acc.cacheWriteInputTokens + u.cacheWriteInputTokens,
      outputTokens: acc.outputTokens + u.outputTokens,
    }),
    { ...ZERO_USAGE },
  );
}

/** "$1.20" at/above $1; "$0.0123" below $1; "<$0.0001" for sub-fraction-of-a-cent;
 *  "$0.00" for an exact zero. The point of the feature is to show the cost is tiny. */
export function formatUsd(dollars: number): string {
  if (dollars <= 0) return "$0.00";
  if (dollars < 0.0001) return "<$0.0001";
  if (dollars < 1) return `$${dollars.toFixed(4)}`;
  return `$${dollars.toFixed(2)}`;
}

/** "88%" — whole-percent cache-hit label. */
export function formatCachePct(rate: number): string {
  return `${Math.round(rate * 100)}%`;
}
```

- [ ] **Step 4: Run the tests to confirm they pass**

Run: `pnpm vitest run src/lib/pricing.test.ts`
Expected: PASS (all).

- [ ] **Step 5: Commit**

```bash
git add src/lib/pricing.ts src/lib/pricing.test.ts
git commit -m "feat: pricing module — canonical usage shape, cost + cache-rate helpers"
```

---

### Task 2: Normalize Review cell usage to the canonical shape

**Files:**
- Modify: `src/app/api/review/cell/route.ts:144-152` (the success-body `usage` object)
- Modify: `src/lib/review-grid.ts:104-110` (replace the local `CellUsage` with the canonical `TokenUsage`)
- Test: `src/app/api/review/cell/route.test.ts`, `src/lib/review-grid.test.ts`
- Touch (fixtures only): `src/components/review/grid-cell.test.tsx:5,10`, `src/components/review/cell-inspector.test.tsx:5,26`, `src/components/review/review-screen.test.tsx:53`

The raw SDK already gives unambiguous fields; this is a rename so the field names match the canonical shape (`input_tokens` → `uncachedInputTokens`, `cache_creation_input_tokens` → `cacheWriteInputTokens`).

- [ ] **Step 1: Update the cell route's success body** (`src/app/api/review/cell/route.ts`)

Replace the `usage` object in the final `Response.json(...)`:

```ts
  // usage rides along so #17 (cost + cache surfacing) is pure frontend. Raw-SDK
  // `input_tokens` is the UNCACHED count; total input also includes the two
  // cache fields, which the pricing module bills at their own multipliers.
  return Response.json({
    answer: verified,
    usage: {
      uncachedInputTokens: message.usage.input_tokens,
      cacheReadInputTokens: message.usage.cache_read_input_tokens ?? 0,
      cacheWriteInputTokens: message.usage.cache_creation_input_tokens ?? 0,
      outputTokens: message.usage.output_tokens,
    },
  });
```

- [ ] **Step 2: Replace `CellUsage` with the canonical `TokenUsage`** (`src/lib/review-grid.ts`)

At the top, add to the existing contract import region:

```ts
import type { TokenUsage } from "@/lib/pricing";
```

Delete the local `CellUsage` type (lines ~104-110) and re-export the canonical one so existing `import { ... CellUsage } from "@/lib/review-grid"` callers keep working:

```ts
/** Usage fields a cell carries for #17 cost/cache surfacing. Canonical shape
 *  lives in pricing.ts; re-exported here as the grid's historical name. */
export type CellUsage = TokenUsage;
```

`CellResult`, `CellResponse`, `regenerateCell`, and `runGrid` are unchanged — they already reference `CellUsage`/`usage` structurally.

- [ ] **Step 3: Update the route + grid tests, then the three review-component test fixtures**

In `src/app/api/review/cell/route.test.ts`, change the asserted `usage` shape to the four canonical fields (a successful cell asserts `uncachedInputTokens`, `cacheReadInputTokens`, `cacheWriteInputTokens`, `outputTokens` mapped from the mocked `message.usage`). In `src/lib/review-grid.test.ts`, update any `usage` literals on `done` results to the canonical field names. Then update the three component test fixtures (`grid-cell.test.tsx`, `cell-inspector.test.tsx`, `review-screen.test.tsx`) whose `CellUsage`/`usage` literals use the old names — pure field renames, no behavioral assertions change.

Example fixture rewrite (applies to each):
```ts
const usage: CellUsage = {
  uncachedInputTokens: 1200,
  cacheReadInputTokens: 0,
  cacheWriteInputTokens: 0,
  outputTokens: 80,
};
```

- [ ] **Step 4: Run the affected tests**

Run: `pnpm vitest run src/app/api/review/cell/route.test.ts src/lib/review-grid.test.ts src/components/review`
Expected: PASS.

- [ ] **Step 5: Typecheck (the rename ripples through types)**

Run: `pnpm tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/app/api/review/cell/route.ts src/lib/review-grid.ts \
  src/app/api/review/cell/route.test.ts src/lib/review-grid.test.ts \
  src/components/review/grid-cell.test.tsx src/components/review/cell-inspector.test.tsx \
  src/components/review/review-screen.test.tsx
git commit -m "refactor: cell route + grid emit canonical TokenUsage shape"
```

---

### Task 3: Review header — per-run cost + cache %

**Files:**
- Modify: `src/components/review/status-bar.tsx` (add cost / cache pills)
- Modify: `src/components/review/review-screen.tsx` (aggregate done cells; new `modelId` prop)
- Modify: `src/app/(workspace)/review/page.tsx` (pass `modelId`)
- Test: `src/components/review/status-bar.test.tsx` (create if absent), `src/components/review/review-screen.test.tsx`

**Per-run cost definition (decision, see Decisions):** the aggregate is the sum of every `done` cell currently in the grid — the grid's real spend this session. Running/idle/error cells contribute nothing.

- [ ] **Step 1: Write the failing StatusBar test**

```tsx
// src/components/review/status-bar.test.tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { StatusBar } from "./status-bar";

const counts = { total: 6, done: 3, running: 0, error: 0 };

describe("StatusBar cost/cache", () => {
  it("shows cost and cache pills when provided", () => {
    render(<StatusBar rows={2} columns={3} counts={counts} cost="$0.0123" cachePct="42%" />);
    expect(screen.getByText("$0.0123")).toBeInTheDocument();
    expect(screen.getByText(/cache · 42%/)).toBeInTheDocument();
  });

  it("omits the cost/cache pills when not provided", () => {
    render(<StatusBar rows={2} columns={3} counts={counts} />);
    expect(screen.queryByText(/cache ·/)).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `pnpm vitest run src/components/review/status-bar.test.tsx`
Expected: FAIL — `cost`/`cachePct` props don't exist yet.

- [ ] **Step 3: Add the pills to `StatusBar`**

Extend the props and render two pills (before the existing state pills) when `cost` is present:

```tsx
export function StatusBar({
  rows,
  columns,
  counts,
  cost,
  cachePct,
}: {
  rows: number;
  columns: number;
  counts: { total: number; done: number; running: number; error: number };
  /** Preformatted per-run cost (e.g. "$0.0123"); omitted when nothing has run. */
  cost?: string;
  /** Preformatted cache-hit percent (e.g. "42%"); omitted when nothing has run. */
  cachePct?: string;
}) {
```

Inside the right-hand `flex items-center gap-2.5` group, before the `{counts.done} done` pill:

```tsx
        {cost && (
          <Pill tone="default" title="Estimated cost of this grid run">
            {cost}
          </Pill>
        )}
        {cachePct && (
          <Pill tone="default" title="Share of input tokens served from cache">
            cache · {cachePct}
          </Pill>
        )}
```

- [ ] **Step 4: Aggregate in `ReviewScreen` and add the `modelId` prop**

Add imports:
```ts
import { cacheHitRate, formatCachePct, formatUsd, sumUsage, usageCostUsd, type TokenUsage } from "@/lib/pricing";
```

Change the signature:
```ts
export function ReviewScreen({ modelLabel, modelId }: { modelLabel: string; modelId: string }) {
```

After `const counts = gridCounts(...)` compute the run aggregate:
```ts
  // Per-run cost/cache: every done cell's real usage, summed. Idle/running/error
  // cells contribute nothing. Undefined figures hide the pills until something runs.
  const doneUsages: TokenUsage[] = Object.values(cells)
    .filter((c): c is Extract<CellResult, { status: "done" }> => c.status === "done")
    .map((c) => c.usage);
  const runUsage = doneUsages.length > 0 ? sumUsage(doneUsages) : null;
  const runCost = runUsage ? formatUsd(usageCostUsd(runUsage, modelId)) : undefined;
  const runCachePct = runUsage ? formatCachePct(cacheHitRate(runUsage)) : undefined;
```

Pass to StatusBar:
```tsx
      <StatusBar rows={docIds.length} columns={columns.length} counts={counts} cost={runCost} cachePct={runCachePct} />
```

- [ ] **Step 5: Pass `modelId` from the page** (`src/app/(workspace)/review/page.tsx`)

```tsx
  return (
    <ReviewScreen
      modelLabel={modelDisplayLabel(modelFor("review"))}
      modelId={modelFor("review")}
    />
  );
```

- [ ] **Step 6: Update `review-screen.test.tsx`**

Every `render(<ReviewScreen .../>)` now needs `modelId="claude-sonnet-4-6"` (alongside the existing `modelLabel`). Add one assertion: after a run that produces a `done` cell with usage, a cost pill matching `/^\$/` appears in the header. (The existing run-flow test already drives a done cell; assert the pill renders.)

- [ ] **Step 7: Run the tests + typecheck**

Run: `pnpm vitest run src/components/review src/app` then `pnpm tsc --noEmit`
Expected: PASS, no type errors.

- [ ] **Step 8: Commit**

```bash
git add src/components/review/status-bar.tsx src/components/review/review-screen.tsx \
  src/components/review/status-bar.test.tsx src/components/review/review-screen.test.tsx \
  "src/app/(workspace)/review/page.tsx"
git commit -m "feat: Review header shows per-run cost + cache %"
```

---

### Task 4: Enable Assistant caching + normalize Assistant usage

**Files:**
- Modify: `src/lib/chat-ui.ts` (`AssistantMetadata` → `usage?: TokenUsage`; add `normalizeAssistantUsage`)
- Modify: `src/app/api/assistant/chat/route.ts` (cache breakpoint on system message; emit + persist canonical usage)
- Modify: `src/components/assistant/chat-message.tsx:75-82` (render usage from the new shape)
- Test: `src/lib/chat-ui.test.ts`, `src/app/api/assistant/chat/route.test.ts`, `src/components/assistant/chat-message.test.tsx`

- [ ] **Step 1: Write the failing `normalizeAssistantUsage` test** (`src/lib/chat-ui.test.ts`)

```ts
import { normalizeAssistantUsage } from "@/lib/chat-ui";

describe("normalizeAssistantUsage", () => {
  it("splits the AI SDK total into uncached/read/write using providerMetadata", () => {
    // AI SDK: inputTokens is TOTAL (incl cache); cachedInputTokens is the read subset.
    const usage = { inputTokens: 1000, outputTokens: 200, cachedInputTokens: 600, totalTokens: 1200 };
    const pm = { anthropic: { cacheCreationInputTokens: 100 } };
    expect(normalizeAssistantUsage(usage, pm)).toEqual({
      uncachedInputTokens: 300, // 1000 - 600 read - 100 write
      cacheReadInputTokens: 600,
      cacheWriteInputTokens: 100,
      outputTokens: 200,
    });
  });

  it("treats missing cache fields as zero (no caching yet)", () => {
    const usage = { inputTokens: 500, outputTokens: 50, totalTokens: 550 };
    expect(normalizeAssistantUsage(usage, undefined)).toEqual({
      uncachedInputTokens: 500,
      cacheReadInputTokens: 0,
      cacheWriteInputTokens: 0,
      outputTokens: 50,
    });
  });

  it("never returns a negative uncached count", () => {
    const usage = { inputTokens: 100, outputTokens: 0, cachedInputTokens: 90 };
    const pm = { anthropic: { cacheCreationInputTokens: 50 } }; // 90+50 > 100
    expect(normalizeAssistantUsage(usage, pm).uncachedInputTokens).toBe(0);
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `pnpm vitest run src/lib/chat-ui.test.ts`
Expected: FAIL — `normalizeAssistantUsage` not exported.

- [ ] **Step 3: Update `chat-ui.ts`**

Add imports and replace `AssistantMetadata`; add the normalizer:

```ts
import type { LanguageModelUsage, ProviderMetadata, UIMessage } from "ai";
import type { TokenUsage } from "@/lib/pricing";
```

```ts
/** Message-level metadata: timestamp always, canonical usage once the call finishes. */
export type AssistantMetadata = {
  /** Epoch ms — set by the client for user messages, by the route for assistant ones. */
  createdAt?: number;
  /** Real token usage of the finished assistant turn (#17). */
  usage?: TokenUsage;
};
```

```ts
/**
 * Map the AI SDK's usage (where `inputTokens` is the TOTAL including cache) plus
 * Anthropic's `cacheCreationInputTokens` (only in providerMetadata) into the
 * canonical TokenUsage. Cache-read is `cachedInputTokens`; cache-write comes from
 * providerMetadata; uncached is the remainder (floored at 0 for safety).
 */
export function normalizeAssistantUsage(
  usage: LanguageModelUsage,
  providerMetadata?: ProviderMetadata,
): TokenUsage {
  const total = usage.inputTokens ?? 0;
  const cacheRead = usage.cachedInputTokens ?? 0;
  const anthropic = providerMetadata?.anthropic as { cacheCreationInputTokens?: number } | undefined;
  const cacheWrite = Number(anthropic?.cacheCreationInputTokens ?? 0);
  return {
    uncachedInputTokens: Math.max(0, total - cacheRead - cacheWrite),
    cacheReadInputTokens: cacheRead,
    cacheWriteInputTokens: cacheWrite,
    outputTokens: usage.outputTokens ?? 0,
  };
}
```

- [ ] **Step 4: Run the normalizer test (now passing)**

Run: `pnpm vitest run src/lib/chat-ui.test.ts`
Expected: PASS.

- [ ] **Step 5: Enable caching + emit/persist canonical usage in the chat route**

In `src/app/api/assistant/chat/route.ts`:

(a) Add the import:
```ts
import { normalizeAssistantUsage, type AssistantUIMessage } from "@/lib/chat-ui";
```

(b) Put the system prompt into a cached system message instead of the `system` param. Replace the `streamText({...})` call's `system`/`messages` with a single `messages` array:

```ts
      const result = streamText({
        model: languageModelFor("assistant"),
        messages: [
          {
            role: "system",
            content: system,
            // One cache breakpoint on the document-bearing system prompt: turn 2+
            // of a conversation with the same docs/template pays ~10% on these
            // input tokens (5-min ephemeral TTL). Byte-identical across turns, so
            // it's a clean cache prefix. <1024 tokens (e.g. no docs) simply won't
            // cache — no error, cacheWrite stays 0.
            providerOptions: { anthropic: { cacheControl: { type: "ephemeral" } } },
          },
          ...modelMessages,
        ],
        maxOutputTokens: MAX_OUTPUT_TOKENS,
      });
```

(c) Replace the `messageMetadata` callback to emit canonical usage from the `finish-step` part (which carries `providerMetadata`; the `finish` part does not):

```ts
          messageMetadata: ({ part }) => {
            if (part.type === "start") return { createdAt: Date.now() };
            // finish-step carries usage AND providerMetadata (cache-write count).
            // Single-shot → exactly one finish-step.
            if (part.type === "finish-step") {
              return { usage: normalizeAssistantUsage(part.usage, part.providerMetadata) };
            }
          },
```

(d) In the persistence block (write 2 of 2), replace the metadata with the canonical usage, read from `result.providerMetadata`:

```ts
        const usage = await result.totalUsage;
        const providerMetadata = await result.providerMetadata;
        await appendMessage(
          session.id,
          {
            id: generateId(),
            role: "assistant",
            parts: [
              { type: "text", text },
              ...(verified ? [{ type: "data-citations" as const, data: verified }] : []),
            ],
            metadata: {
              createdAt: Date.now(),
              usage: normalizeAssistantUsage(usage, providerMetadata),
            },
          },
          messages.length,
        );
```

- [ ] **Step 6: Render usage from the new shape in `chat-message.tsx`**

Replace the token-accounting span (lines ~77-82):

```tsx
          {meta?.usage && (
            <span>
              in {meta.usage.uncachedInputTokens.toLocaleString()} · out{" "}
              {meta.usage.outputTokens.toLocaleString()} · cached{" "}
              {meta.usage.cacheReadInputTokens.toLocaleString()}
            </span>
          )}
```

- [ ] **Step 7: Update the route + chat-message tests**

In `src/app/api/assistant/chat/route.test.ts`: the mock for `languageModelFor` / the streamed result must surface usage + providerMetadata so the route's metadata emission can be asserted. Assert the finished assistant message's `metadata.usage` matches the canonical shape derived from the mock's usage + `cacheCreationInputTokens`. Keep the existing streaming/persistence assertions. If the existing mock supplies `system` as a param expectation, update it to expect the system message in the `messages` array with `providerOptions.anthropic.cacheControl`.

In `src/components/assistant/chat-message.test.tsx`: update any `metadata` fixtures from the old `{ inputTokens, outputTokens, cachedInputTokens }` to `{ usage: { uncachedInputTokens, cacheReadInputTokens, cacheWriteInputTokens, outputTokens } }`; keep the "in … · out … · cached …" assertion.

- [ ] **Step 8: Run the tests + typecheck**

Run: `pnpm vitest run src/lib/chat-ui.test.ts src/app/api/assistant/chat/route.test.ts src/components/assistant/chat-message.test.tsx` then `pnpm tsc --noEmit`
Expected: PASS, no type errors.

- [ ] **Step 9: Commit**

```bash
git add src/lib/chat-ui.ts src/app/api/assistant/chat/route.ts src/components/assistant/chat-message.tsx \
  src/lib/chat-ui.test.ts src/app/api/assistant/chat/route.test.ts src/components/assistant/chat-message.test.tsx
git commit -m "feat: cache the Assistant system prompt; emit canonical usage"
```

---

### Task 5: Assistant strip — per-message cost + cache %

**Files:**
- Modify: `src/components/assistant/context-strip.tsx` (right-side cost / cache pills)
- Modify: `src/components/assistant/assistant-chat.tsx` (compute latest-message figures; new `modelId` prop)
- Modify: `src/app/(workspace)/assistant/page.tsx` (pass `modelId`)
- Test: `src/components/assistant/context-strip.test.tsx`, `src/components/assistant/assistant-chat.test.tsx` (if present)

The handoff places the cost + cache-hit pills on the right of the CONTEXT strip. They reflect the most recent completed assistant message's real usage (`est. $X / msg`).

- [ ] **Step 1: Write the failing ContextStrip test**

```tsx
// add to src/components/assistant/context-strip.test.tsx
it("renders the cost and cache-hit pills when figures are provided", () => {
  render(<ContextStrip docs={[]} cost="$0.0420" cacheHit="87%" />);
  expect(screen.getByText(/est\. \$0\.0420 \/ msg/)).toBeInTheDocument();
  expect(screen.getByText(/cache hit · 87%/)).toBeInTheDocument();
});

it("omits the pills when no figures are provided", () => {
  render(<ContextStrip docs={[]} />);
  expect(screen.queryByText(/\/ msg/)).not.toBeInTheDocument();
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `pnpm vitest run src/components/assistant/context-strip.test.tsx`
Expected: FAIL — `cost`/`cacheHit` props don't exist.

- [ ] **Step 3: Add the right-side pills to `ContextStrip`**

```tsx
export function ContextStrip({
  docs,
  cost,
  cacheHit,
}: {
  docs: DocumentMeta[];
  /** Preformatted per-message cost estimate (e.g. "$0.0420"); from the latest answer. */
  cost?: string;
  /** Preformatted cache-hit percent (e.g. "87%"); from the latest answer. */
  cacheHit?: string;
}) {
```

Before the strip's closing `</div>`, add a right-aligned group (so it sits opposite the CONTEXT pills even though the row wraps):

```tsx
      {(cost || cacheHit) && (
        <div className="ml-auto flex items-center gap-2">
          {cost && (
            <Pill tone="default" title="Estimated cost per message (last answer)">
              est. {cost} / msg
            </Pill>
          )}
          {cacheHit && (
            <Pill tone="default" title="Share of input tokens served from cache (last answer)">
              cache hit · {cacheHit}
            </Pill>
          )}
        </div>
      )}
```

- [ ] **Step 4: Compute the figures in `AssistantChat` and add `modelId`**

Add imports:
```ts
import { cacheHitRate, formatCachePct, formatUsd, usageCostUsd } from "@/lib/pricing";
```

Change the signature to accept `modelId`:
```ts
export function AssistantChat({
  modelLabel,
  modelId,
  initialMessages,
}: {
  modelLabel: string;
  modelId: string;
  initialMessages?: AssistantUIMessage[];
}) {
```

After `messages` is available (e.g. just before the return), derive the latest completed-answer figures:
```ts
  // The most recent assistant turn that reported usage drives the strip's
  // "per-msg" estimate. Hidden until at least one answer has finished.
  const lastUsage = [...messages]
    .reverse()
    .find((m) => m.role === "assistant" && m.metadata?.usage)?.metadata?.usage;
  const stripCost = lastUsage ? formatUsd(usageCostUsd(lastUsage, modelId)) : undefined;
  const stripCacheHit = lastUsage ? formatCachePct(cacheHitRate(lastUsage)) : undefined;
```

Pass to the strip:
```tsx
      <ContextStrip docs={selectedDocs} cost={stripCost} cacheHit={stripCacheHit} />
```

- [ ] **Step 5: Pass `modelId` from the page** (`src/app/(workspace)/assistant/page.tsx`)

```tsx
    <AssistantChat
      modelLabel={modelDisplayLabel(modelFor("assistant"))}
      modelId={modelFor("assistant")}
      initialMessages={thread.messages}
    />
```

- [ ] **Step 6: Update tests**

`context-strip.test.tsx`: existing tests pass `docs` only — still valid. If any `assistant-chat.test.tsx` exists, add `modelId="claude-opus-4-8"` to its renders; otherwise none needed.

- [ ] **Step 7: Run the tests + typecheck**

Run: `pnpm vitest run src/components/assistant src/app` then `pnpm tsc --noEmit`
Expected: PASS, no type errors.

- [ ] **Step 8: Commit**

```bash
git add src/components/assistant/context-strip.tsx src/components/assistant/assistant-chat.tsx \
  src/components/assistant/context-strip.test.tsx "src/app/(workspace)/assistant/page.tsx"
git commit -m "feat: Assistant strip shows per-message cost + cache hit %"
```

---

### Task 6: Full verification + review marker

**Files:**
- Modify: `.claude/epics/mvp/17.md` (set `reviewed_sha` after the final review)

- [ ] **Step 1: Full test suite**

Run: `pnpm vitest run`
Expected: all green (the prior ~282 + the new pricing/status-bar/strip/normalizer tests).

- [ ] **Step 2: Typecheck**

Run: `pnpm tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Lint (no NEW problems vs. main's baseline)**

Run: `pnpm lint`
Expected: no new errors attributable to the files touched here.

- [ ] **Step 4: Manual smoke (optional, if dev creds present)**

`pnpm dev`, send a 2-message Assistant chat with a doc selected → second message's strip shows a non-zero `cache hit · N%`; run a Review grid → header shows `$…` and `cache · N%`.

- [ ] **Step 5: Record the review marker (after the final whole-implementation review passes)**

```bash
sha="$(git rev-parse HEAD)"
# set reviewed_sha: $sha in .claude/epics/mvp/17.md frontmatter
git add .claude/epics/mvp/17.md
git commit -m "chore: mark #17 reviewed at ${sha:0:7}"
```

---

## PM finalization note (verbatim for the execution loop)

This work runs in a PM-managed git worktree. PM owns finalization via `/pm:ship`. When all tasks pass and tests are green and the `finishing-a-development-branch` step runs, choose **"Keep the branch as-is, I'll handle it later."** Do **not** merge, open a PR, delete the branch, or remove the worktree. Then report: *"Implementation complete, tests green — `.worktrees/17-cost-cache-surfacing` is ready. Run `/pm:ship 17` to merge and clean up."*
