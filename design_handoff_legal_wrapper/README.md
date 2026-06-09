# Handoff: Legal AI Wrapper — Assistant & Review

## Overview

Two core pages for a Harvey/Legora-style legal AI workspace:

1. **Assistant** — A document-grounded chat interface. The user picks documents from a workspace, asks legal questions, and gets answers with inline clause citations. The system prompt is fully transparent and editable inline.
2. **Review** — A tabular grid for batch document review. Each row is a document, each column is a prompt (e.g., "What is the governing law?"). Cells stream answers with per-cell status, confidence scores, and citations.

Both pages share a dark, warm-gray aesthetic with amber accents.

## About the Design Files

The files in this bundle are **design references created in HTML** — high-fidelity prototypes showing intended look and behavior, **not production code to copy directly**.

The task is to **recreate these designs in your target codebase's existing environment** (React, Vue, SvelteKit, etc.) using its established patterns, component library, and routing conventions. If no environment exists yet, pick whatever framework is most appropriate (Next.js + Tailwind is a reasonable default for a SaaS product like this) and implement there.

The HTML prototypes use inline styles, React UMD via CDN, and Babel Standalone — none of that should be carried over.

## Fidelity

**High-fidelity.** Final colors, typography, spacing, and component-level interactions are decided. The developer should recreate the UI pixel-perfectly. Data is seeded (mocked) — wiring it to a real backend and replacing the seed data is part of implementation.

---

## Design Tokens

### Color Palette (OKLCH, dark theme)

| Token         | Value                              | Use                                    |
|---------------|------------------------------------|----------------------------------------|
| `bg`          | `oklch(0.16 0.005 60)` ≈ `#1a1815` | Page background                        |
| `panel`       | `oklch(0.195 0.006 60)`            | Cards, drawers, prompt panel           |
| `panelHi`     | `oklch(0.225 0.006 60)`            | Selected items, button bg, pills       |
| `border`      | `oklch(0.285 0.006 60)`            | Primary borders, dividers              |
| `borderSoft`  | `oklch(0.24 0.006 60)`             | Internal section dividers              |
| `text`        | `oklch(0.96 0.002 60)` ≈ `#f4f2ee` | Primary text                           |
| `muted`       | `oklch(0.68 0.005 60)`             | Secondary text                         |
| `dim`         | `oklch(0.48 0.005 60)`             | Tertiary text, metadata, timestamps    |
| `amber`       | `oklch(0.80 0.13 78)`              | Brand accent, active states, warnings  |
| `amberDim`    | `oklch(0.55 0.09 78)`              | Hover variants of amber                |
| `green`       | `oklch(0.78 0.12 150)`             | Success, "done" cells, high confidence |
| `red`         | `oklch(0.72 0.15 25)`              | Errors                                 |
| `blue`        | `oklch(0.72 0.10 240)`             | Context pills, citations               |

Pill background tints use the accent color at low chroma over the panel (e.g., amber pill bg = `oklch(0.28 0.05 78 / 0.15)` with border `oklch(0.5 0.08 78 / 0.4)`).

### Typography

- **Sans (body, UI):** `"Inter Tight"`, `"Söhne"`, system fallback. Base size 13px, line-height 1.5–1.6.
- **Serif (display, document/workspace titles):** `"Instrument Serif"`. Used at 17–18px with `letter-spacing: -0.01em`.
- **Mono (metadata, prompts, citations, tokens):** `"JetBrains Mono"`, `"SF Mono"`. Sizes 9.5–11.5px, letter-spacing 0.02–0.08em, uppercase for labels.

Typography scale used in mocks:
- 9.5px mono — role tags, sub-labels in cells
- 10–10.5px mono — section labels (uppercase), metadata
- 11–11.5px mono — prompt copy, inspector content
- 12.5px sans — document names, cell values
- 13–13.5px sans — body text, message content
- 17–18px serif — workspace/page titles

### Spacing

8px base. Common values: 4, 6, 8, 10, 12, 14, 16, 20, 24, 28, 32px.

### Border Radius

Notably **small**. Almost everything is `3–4px`. The rail logo and toolbar buttons are 3–4px. **No large rounded corners** anywhere — this is part of the aesthetic.

### Shadows

Minimal. The design uses borders and background contrast instead of shadows for elevation. The only shadow is on the design canvas focus overlay (which is dev-tooling, not production).

---

## Screens

### 1. Assistant Page

**Frame:** 1440 × 900.

**Layout (3 columns):**
- Left: `56px` icon rail (fixed)
- Middle: `280px` document sidebar (fixed)
- Right: flexible main column (chat + composer)

#### Left Rail (56px)
- Logo block: 28px square, border, mono "LL" amber, top-margin 14px.
- Three nav items, each 40px tall, stacked vertically:
  - Assistant (chat icon) — currently active
  - Review (grid icon)
  - Documents (folder icon)
- Active item has `panelHi` background, full text color. Inactive items are dim with a 4-letter mono label below the icon (e.g., "ASSI", "REVI", "DOCU").
- Settings gear at bottom (dim).

#### Document Sidebar (280px)
- **Header (14px padding):**
  - "WORKSPACE" mono uppercase label + ghost "Upload" button (right-aligned)
  - Workspace name in serif 18px: e.g., "Aperture · MSA Renewal"
  - Mono dim sub-line: "6 documents · 100,750 tokens"
- **In-Context section:**
  - Label "IN CONTEXT · 3" (left) + token usage "47.5k / 180k" (right) in mono dim
  - 3px tall context meter bar (panelHi base, amber fill) showing % of max context
- **Document list** (scrollable):
  - Each row: 14px checkbox (left, amber when on), then doc name + mono metadata (`MSA · 42p · 31.4k tok`)
  - Selected rows have `panelHi` bg and `borderSoft` border
  - Click anywhere on row toggles selection
- **Footer (10px padding, top border):**
  - "session · msa-renewal-04" + "saved 10:44" in mono dim

#### Top Bar (44px)
- Breadcrumbs (left, mono): `~/workspaces / Aperture · MSA Renewal / Assistant`
- Right cluster:
  - Active model pill: `● OPUS 4.5` (amber tone)
  - "Show prompt" / "Hide prompt" ghost button
  - Divider
  - "New session" ghost button

#### Context Strip (below top bar)
- 10px vertical padding, 20px horizontal
- "CONTEXT" mono uppercase label
- One blue-tinted pill per selected document with the doc icon and filename
- Right-aligned: "cache hit · 84%" and "est. $0.04 / msg" pills (default tone)

#### System Prompt Panel (collapsible, hidden by default)
- Toggled by "Show prompt" button
- `panel` background, 12–14px padding
- Header row:
  - "SYSTEM PROMPT · EDITABLE" in amber mono uppercase
  - Char count + token estimate pill
  - Reset + Copy ghost buttons (right)
- Editable `<textarea>`: `bg` background, 1px border, 12px padding, mono 11.5px, 1.55 line-height, min-height 160px, resizable vertical
- Footer note (mono dim): "`{{DOCUMENTS}}` is replaced with full text of selected docs on each call · nothing is hidden from you"

#### Message Thread
- Scrollable, 24px top/bottom padding
- Max-width 780px, centered, 32px horizontal padding
- **Each message** is a flex row:
  - **Role tag** (28px wide column): mono 9.5px, uppercase, letter-spaced. User = "You" (dim). Assistant = "LL" (amber).
  - **Content column:**
    - Header line: timestamp + token accounting (in/out/cached) in mono dim
    - Body: 13.5px, line-height 1.6, supports `**bold**`. User messages use `muted` color; assistant uses full `text`.
    - **Citations** (assistant only): below the message, wrapped pills with doc icon + `DocName §X · p.N` in mono
    - **Actions** (assistant only): below citations — Copy, Regenerate, Edit prompt ghost buttons
- **Streaming indicator** at the bottom of the thread:
  - Same role tag layout, but body is a pulsing amber dot + "drafting redline counter · 847 tok generated" in mono

#### Composer (bottom)
- 12px top / 20px bottom padding, 32px horizontal, top border
- Max-width 780px, centered
- Outer box: `panel` bg, 1px border, 4px radius, 12–14px padding
- Inner textarea: transparent, 13.5px sans, min-height 52px, no border/outline
- Bottom row of composer:
  - Left: "Attach" ghost btn + divider + mono hint "⌘↵ to send · 3 docs attached"
  - Right: Primary "Send" button (light bg, dark text)

---

### 2. Review Page

**Frame:** 1440 × 900.

**Layout (2 columns):**
- Left: `56px` icon rail (same as Assistant, Review item active)
- Right: flexible main column (header + status bar + grid + inspector)

#### Top Bar (44px)
- Breadcrumbs: `~/workspaces / Q2 Incoming NDAs / Review`
- Right: `● SONNET 4.5` pill + `cache · 91%` pill + divider + "CSV" ghost + Primary "Run all" button

#### Status Bar (below top bar, ~60px)
- Left: serif 17px workspace title "Q2 Incoming NDAs" + mono dim "8 rows × 6 columns · 48 cells"
- Right cluster:
  - "32/48 complete" mono text
  - 160 × 3px multi-segment progress bar — green (done) + amber (running) + red (errors)
  - Pills: `● 32 done` (green), `● 4 running` (amber, pulsing), `● 1 error` (red)

#### Grid (scrollable both axes)
- **Sticky column headers** (top, z-index 3):
  - Left "Document" column (240px wide, sticky-left, z-index 4, lock icon + "DOCUMENT" mono label)
  - One header cell per prompt column, variable widths (130–260px), each containing:
    - Column title (12.5px sans, 500 weight) + chevron-down icon
    - Prompt text (mono 10px dim, 2-line clamp, line-height 1.35) — the actual prompt sent per cell
  - Trailing "+ Add column" ghost button cell
- **Row** (per document, ~80px tall depending on content):
  - **Doc cell** (left, 240px, sticky-left): document name (12.5px) + mono dim metadata `Acme Corp. · Jan 2026`
  - **Data cells:** Status-dependent rendering — see Cell States below
  - Active row gets `oklch(0.21 0.006 60)` background
- **Active cell:**
  - `oklch(0.25 0.02 78 / 0.35)` background tint (amber wash)
  - 1px amber outline, inset
- Add row button at the bottom: "+ Add documents" ghost

##### Cell States

| State    | Visual                                                                                              |
|----------|-----------------------------------------------------------------------------------------------------|
| `idle`   | Mono dim em-dash "—"                                                                                |
| `running`| Pulsing amber dot + "running" label (mono amber) + 2px shimmer bar (amber, animates left→right)     |
| `error`  | Red dot + "error" label (mono red) + 11.5px error message (e.g., "parse error: §7 contains table…") |
| `done`   | Value text (12.5px sans, or mono if column.numeric) clamped to 3 lines + confidence dot + citation  |

Confidence dot color: green if >0.92, amber if >0.85, else red. Citation rendered as `p.6 §14.1` in 9.5px mono dim.

#### Inspector Drawer (bottom, conditional)
- Appears when a `done` cell is active
- `panel` bg, 14px vertical / 20px horizontal padding, top border, min-height 150px
- Two columns:
  - **Left (flex 1):**
    - Header line: "CELL" mono label + active doc · column name (mono 11.5px) + confidence pill (ok/warn) + citation pill (ctx tone)
    - Value: 13.5px text, 1.55 line-height, max-width 720px
    - Action row: Regenerate · Edit prompt · View source (ghost buttons)
  - **Right (240px, left-bordered, 20px left padding):**
    - "PROMPT FOR COLUMN" mono label
    - The full column prompt in mono 11px muted, 1.55 line-height

---

## Shared Components

All defined in `components/shared.jsx`. When porting, map these to your design system:

### `<Pill>`
Inline-flex pill, 2px vertical / 8px horizontal padding, 3px radius, 10.5px mono, letter-spacing 0.02em. Variants:
- `default`: panelHi bg, muted fg, border bd
- `active`: amber tint
- `ctx`: blue tint
- `ok`: green tint
- `warn`: amber tint (same as active visually, semantically different)

### `<Btn>`
Three styles:
- `primary`: light (text-color) bg, dark (bg-color) text, light border
- (default): panelHi bg, text color, border
- `ghost`: transparent bg, transparent border, text color

Sizes: `sm` = 24px tall, 11.5px text, 8px horizontal padding. `md` = 30px tall, 12.5px text, 12px horizontal padding.

Optional leading `icon` (13px SVG) with 6px gap.

### `<Icon>`
Currentcolor-stroked SVG, 24×24 viewBox, configurable size and stroke width (default 14px / 1.6 stroke). Icons used: chat, grid, doc, upload, settings, send, plus, play, check, x, chevDown, chevRight, download, eye, edit, refresh, copy, sparkle, folder, search, filter, stop, lock. See `components/shared.jsx` for the path data — port these to your icon system (Lucide and Tabler both have equivalents).

### `<Rail>` / `<TopBar>`
The persistent left rail and top breadcrumb bar — described above. In a real app these become layout shells around route content.

---

## Interactions & Behavior

### Assistant
- **Document toggle:** clicking a doc row in the sidebar toggles its inclusion. Update the context meter and the context strip pills live.
- **System prompt toggle:** "Show/Hide prompt" button reveals/hides the editable system prompt panel.
- **System prompt edit:** Textarea is fully editable. Char + token estimate updates as user types. Reset restores defaults. `{{DOCUMENTS}}` is a literal token replaced server-side with selected doc text at send time.
- **Composer send:** ⌘↵ keyboard shortcut + Send button. Streams response into a new assistant message bubble with a pulsing role tag dot until done.
- **Message actions:** Copy (clipboard), Regenerate (re-send same prompt), Edit prompt (loads user message back into composer).
- **Citations:** Click should open the source doc to the cited section. (Out of scope for these mocks but expected.)

### Review
- **Cell select:** Clicking any cell makes it active (amber outline) and opens/updates the inspector drawer if the cell is `done`.
- **Column header click:** Opens a column editor (mocked as state toggle in the prototype — real implementation should let user rename column + edit prompt + delete column).
- **Run all:** Re-runs every cell. Per-cell run can be triggered via the inspector's "Regenerate" button.
- **CSV export:** Dumps the grid as CSV.
- **Add column / Add documents:** Should open a modal or inline editor.

### Streaming
Both pages stream model output. Cells in the Review grid update independently (one cell can finish while siblings are still running). Use whatever streaming primitive your stack offers (SSE, WebSocket, fetch streams).

---

## State Management

### Assistant
- `selectedDocs: string[]` — IDs of docs currently in context
- `showSysPrompt: boolean`
- `sysPrompt: string`
- `messages: Message[]`
- `input: string`
- `model: string` (currently hardcoded to `claude-opus-4-5`)

### Review
- `activeCell: { row: docId, col: colId }`
- `editingCol: colId | null`
- `grid: Record<docId, Record<colId, Cell>>` where each `Cell` is `{ status, value, confidence, citation, errorMsg? }`

### Data fetching
- Documents come from a workspace endpoint (paginated)
- Each Assistant turn POSTs `{ docs, sysPrompt, messages }` and streams back the assistant message + citations
- Each Review cell run POSTs `{ doc, columnPrompt }` and streams back `{ value, confidence, citation }`. Errors include a debuggable message.

---

## Assets

No image assets. All icons are inline SVG with path data in `components/shared.jsx`. No logos in the design — the rail uses a 2-letter "LL" wordmark you should replace with the real brand mark.

Fonts loaded from Google Fonts:
- Inter Tight (400, 500, 600, 700)
- Instrument Serif (400, italic)
- JetBrains Mono (400, 500, 600)

Self-host these in production.

---

## Files in This Bundle

| File                          | Purpose                                                                |
|-------------------------------|------------------------------------------------------------------------|
| `LocalLegora.html`            | Entry HTML — loads React/Babel CDNs and the JSX files in order         |
| `components/shared.jsx`       | Tokens, fonts, icon paths, `<Rail>`, `<TopBar>`, `<Pill>`, `<Btn>`     |
| `components/assistant.jsx`    | `<AssistantPage>` — full Assistant screen                              |
| `components/review.jsx`       | `<ReviewPage>` + `<Cell>` — full Review grid screen                    |
| `components/app.jsx`          | App root that mounts both pages into the design canvas                 |
| `design-canvas.jsx`           | Dev tool — pan/zoom canvas wrapping both artboards. **Do not port.**   |

Open `LocalLegora.html` in a browser to see the prototype as designed.

---

## Implementation Notes for Claude Code

- The design uses inline styles via a `tokens` object. Convert to your styling system: Tailwind config, CSS variables, theme provider, or whatever's idiomatic.
- The "design canvas" wrapper (`design-canvas.jsx`) is dev tooling that lets the designer view both pages side by side. It is **not** part of the product. Skip it.
- Both pages assume a 1440px design width. Make them responsive — at narrower widths the doc sidebar collapses to a sheet/drawer, the right rail on Review's inspector becomes a stacked section, etc.
- Seed data in `assistant.jsx` (`SEED_DOCS`, `SEED_MESSAGES`) and `review.jsx` (`R_DOCS`, `R_COLS`, `GRID`) is for visualization. Replace with real fetches.
- The visual language is intentionally **terminal-adjacent**: small radii, mono labels, dense info, no gradients, no large rounded buttons. Preserve this when porting — don't let your component library round all the corners up to 8px+.
