---
title: "Legal Document Workspace MVP"
status: open
prd: mvp
created: 2026-06-08
github_issue: 1
---

# Legal Document Workspace MVP

## Goal

Build a faithful, local-first clone of the Harvey/Legora core product — a
document-grounded Assistant chat and a multi-doc Review grid, wrapped in a
transparent tuned system prompt — proving the incumbent tools are simple and
overpriced. Runs on a laptop via `npm run dev`.

## Acceptance Criteria

Lifted from the PRD's success criteria:

- [ ] Demoable end to end on a laptop: upload docs → Assistant chat → Review grid
      → CSV export, all from `npm run dev`, no external service but the Anthropic API.
- [ ] The wrapper is visible: the Assistant exposes the editable system prompt
      with its `{{DOCUMENTS}}` token.
- [ ] Pixel-faithful to the `design_handoff_legal_wrapper/` mocks.
- [ ] Review grid is cost-viable: prompt caching active; per-run cost surfaced.
- [ ] Citations and confidence render (display level) in both tabs.
- [ ] Token ceiling fails gracefully: warning near ~180k, clear error past it.

## Dependencies

- `ANTHROPIC_API_KEY` in `.env.local`.
- Node 20+.
- `design_handoff_legal_wrapper/` bundle as the design source of truth.

## Technical Approach

Greenfield Next.js 15 (App Router) + TypeScript app. SQLite via Prisma for local
persistence. No RAG — full document text passed in every call. The Anthropic SDK
drives both tabs (Opus for Assistant, Sonnet for Review). Vercel AI SDK handles
streaming. Prompt caching is load-bearing for the Review grid. A shared
citation/confidence structured-output contract feeds both tabs.

Maps to the four CLAUDE.md build phases:
- **Foundation + Phase 1** (skeleton, design system, upload, doc sidebar): 001–005
- **Phase 2** (wrapper, Assistant): 006–010
- **Phase 3** (Review grid): 011–014
- **Phase 4** (polish, demo prep): 015–018

## Tasks

1. 001 — Project scaffold (Next.js 15 + TS + Tailwind + shadcn) (high, small)
2. 002 — Prisma + SQLite schema (high, small) → depends on 001
3. 003 — Design system port (tokens, primitives, layout shell) (high, medium) → depends on 001
4. 004 — Upload + text-extraction API (high, medium) → depends on 002
5. 005 — Document sidebar UI (high, medium) → depends on 002, 003
6. 006 — Anthropic client + wrapper system prompt (high, medium) → depends on 002
7. 007 — Citation + confidence output contract (high, medium) → depends on 006
8. 008 — Assistant chat API (streaming, Opus) (high, medium) → depends on 004, 006, 007
9. 009 — Assistant UI (thread, composer, citations) (high, large) → depends on 003, 008
10. 010 — System-prompt panel (visible/editable) (medium, small) → depends on 009
11. 011 — Review cell API + prompt caching (high, large) → depends on 004, 006, 007
12. 012 — Review grid UI (high, large) → depends on 003, 011
13. 013 — Cell inspector + regenerate (medium, medium) → depends on 012
14. 014 — CSV export (medium, small) → depends on 012
15. 015 — Token-ceiling guardrails (medium, small) → depends on 008, 011
16. 016 — Cost + cache surfacing (medium, medium) → depends on 008, 011
17. 017 — Empty states + error toasts (low, small) → depends on 009, 012
18. 018 — README + demo corpora (medium, medium) → depends on 005, 009, 012

### Sequencing

- **Start immediately:** 001.
- **Critical path:** 001 → 002 → 006 → 007 → 008 → 009 (Assistant) and
  001 → 002 → 006 → 007 → 011 → 012 (Review).
- **Parallelizable once 001 lands:** 003 (design system) runs alongside 002.
- **Two API tracks fork after 007:** Assistant (008–010) and Review (011–014)
  are independent and can be built in either order or in parallel worktrees.
- **Polish (015–018)** comes last; each depends on both tabs existing.
