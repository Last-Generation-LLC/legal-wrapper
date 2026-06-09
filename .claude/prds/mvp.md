---
title: "Legal Document Workspace MVP — Faithful Legal-AI Wrapper Clone"
status: parsed
created: 2026-06-08
epic: mvp
---

# Legal Document Workspace MVP — Faithful Legal-AI Wrapper Clone

## Problem

Incumbent legal-AI tools (Harvey, Legora) command enterprise pricing for what is,
at its core, a thin wrapper over a frontier LLM: load documents, chat with them,
or run a prompt across many at once. This MVP demonstrates that the core product
can be rebuilt simply and locally — proving the complexity and the cost are
largely unjustified.

The argument this MVP makes is narrow and deliberate: **these products are simple
and overpriced.** It is *not* (yet) making the reliability argument — that these
tools hallucinate and drop instructions. That fidelity differentiation is a
**separate, later PRD** built on the fidelity feature from llm-wiki-legal. Keeping
the MVP to a single claim keeps the demo's message clean.

## Users

Two audiences, one tool:

1. **Demo audience (who we're convincing).** Buyers and evaluators of legal-AI
   tools — legal-ops leads, innovation partners, and decision-makers weighing a
   Harvey/Legora contract. The MVP is the artifact that makes the "this isn't
   worth what they charge" case to them.
2. **End users (who actually use it).** Practicing lawyers doing document-heavy
   work — reviewing contracts, NDAs, MSAs — once their legal-ops team self-hosts
   the tool.

The intended distribution model is **open source and self-hostable** (a legal-ops
team installs it on their own infrastructure). That distribution work is a
*later* concern; the MVP's deploy story stays local (`npm run dev`).

## Success Criteria

- **Demoable end to end on a laptop.** Upload real legal documents, chat with
  them in the Assistant, run a multi-doc/multi-prompt grid in Review, export to
  CSV — all from `npm run dev`, no cloud, no external service beyond the Anthropic
  API.
- **The wrapper is visible and the simplicity is the point.** A viewer can open
  the system-prompt panel and see exactly what the model receives, reinforcing
  "there is no magic here."
- **Pixel-faithful to the design handoff.** The Assistant and Review screens match
  the high-fidelity mocks (dark warm-gray + amber, terminal-adjacent density,
  small radii, specified fonts).
- **The Review grid is cost-viable.** Prompt caching is active, so a
  10-doc × 5-column grid does not pay full input price on every cell. Per-run cost
  is surfaced in the UI.
- **Citations and confidence render as designed.** Each answer shows its supporting
  citation pill(s) and a confidence dot, matching the mocks.
- **The token ceiling fails gracefully.** Approaching ~180k combined tokens shows a
  warning; exceeding it shows a clear error rather than a silent bad call.

## Scope

**Core product**
- Upload PDF and DOCX files; parse to plain text (`pdf-parse`, `mammoth`); persist
  locally in SQLite.
- Local SQLite persistence for documents and chat history (Prisma schema).
- Token-count display per document and a combined-context meter with warnings as
  the ~180k-token ceiling approaches.

**The wrapper layer (core to the thesis)**
- User input is not sent raw. The app composes the user's question (Assistant) or
  column prompt (Review) *on top of* a tuned legal-workflow system prompt before
  calling Claude.
- The system prompt contains a literal `{{DOCUMENTS}}` token, replaced server-side
  with the full text of the selected documents on each call.
- Per the transparency principle, the Assistant exposes a **visible, editable**
  system-prompt panel ("nothing is hidden from you"), with reset and copy.

**Assistant tab**
- Chat UI with document multi-select; selected doc text injected via the wrapper.
- Streaming responses (Vercel AI SDK), using **Opus**.
- Context pills showing which documents are "in context"; live context meter.
- Message actions: copy, regenerate, edit prompt.
- **Inline citations (display level)** — answers render citation pills
  (`DocName §X · p.N`).
- **Confidence scoring (display level)** — answers render a confidence dot.

**Review tab**
- Grid: rows = selected documents, columns = user-defined prompts.
- "Run all": one API call per cell, concurrency capped at ~5 parallel requests,
  using **Sonnet**.
- **Prompt caching on document text — mandatory, not polish.**
- Per-cell loading state; cells complete independently.
- Click a cell to open an inspector showing the full answer, its column prompt,
  citation, and confidence; "Regenerate" per cell.
- **Citation + confidence display per cell** (pill + colored confidence dot),
  matching the mocks.
- CSV export of the grid.

**Polish**
- Empty states, error toasts, per-run cost estimate surfaced in the UI.
- README with setup instructions.
- 2–3 curated demo corpora prepared and pre-tested.

**Design**
- The `design_handoff_legal_wrapper/` bundle is the **design source of truth**.
  Recreate the Assistant and Review screens faithfully. The `design-canvas.jsx`
  dev tool is not ported.

## Out of Scope

- **The fidelity / reliability feature** (the llm-wiki-legal differentiation) —
  *separate, later PRD.*
- **Self-host / server packaging** (Docker, deploy docs, multi-server install) —
  *separate, later PRD.* MVP runs locally only.
- **Click-to-source citation highlighting** — clicking a citation pill to open and
  highlight the exact passage in the source PDF. Requires PDF text-coordinate
  mapping; the design handoff itself marks this out of scope for the mocks.
  (Citation pills still *render*; they are not yet click-through.)
- Auth / multi-user / cloud deploy.
- RAG / vector DB / embeddings.
- Agent loops / tool use / multi-step chains.
- Real-time collaboration.
- iManage / NetDocs / Westlaw / Practical Law integrations.

## Constraints

- **Local-first, one command.** Runs on a laptop; `npm run dev` is the entire
  deploy story. No Docker, no cloud.
- **Fixed stack:** Next.js 15 (App Router), TypeScript, Tailwind CSS + shadcn/ui,
  SQLite + Prisma, `pdf-parse`, `mammoth`, `@anthropic-ai/sdk`, Vercel AI SDK
  (`ai`). No LangChain, no vector DB, no Redis, no auth libraries.
- **No RAG; context ceiling ~180k tokens.** Full document text passed in every
  call. Token-count warning required; clear error past the ceiling.
- **Prompt caching mandatory** for the Review grid (load-bearing on cost in
  Phase 3, not Phase-4 polish). Verify current Anthropic caching headers/TTL/
  eligibility against live docs before implementing Review.
- **Model split:** Opus for the Assistant, Sonnet for Review cells. Do not
  cost-optimize reliability away. Exact model IDs to be verified against live
  Anthropic docs before writing API code (the mocks' "4.5" labels are
  placeholders).
- **Single-shot calls**, no agentic chains.
- **Design is locked and high-fidelity.** Dark warm-gray + amber, terminal-adjacent
  (3–4px radii, mono labels, dense layout), fonts Inter Tight / Instrument Serif /
  JetBrains Mono. Responsive below 1440px (sidebar collapses to drawer, inspector
  stacks).
- **`ANTHROPIC_API_KEY`** in `.env.local` (gitignored) is the only external
  dependency. No secrets in code; no telemetry; Node 20+.

## Open Questions

1. **Model IDs to pin.** Verify current Opus / Sonnet model IDs against live
   Anthropic docs before writing API code; do not trust the mock labels or memory.
2. **Eliciting citations + confidence reliably.** Define the structured-output
   format (likely JSON schema) so the model emits honest `DocName §X · p.N`
   citations and a confidence value without fabricating citations. This is the
   real risk in the citation/confidence split.
3. **What "confidence" represents.** Self-reported model confidence is known to be
   unreliable. Decide what we are willing to claim the confidence dot means before
   shipping it.
4. **The tuned legal system-prompt content.** Author and pre-test the wrapper's
   actual prompt text against each demo corpus (the demo-hallucination mitigation).
5. **Demo corpora.** Choose the 2–3 curated document sets to ship and test against.
6. **Per-cell streaming in Review.** Stretch goal or skip for MVP? (Per-cell
   spinner is the baseline; streaming each cell is the stretch.)
