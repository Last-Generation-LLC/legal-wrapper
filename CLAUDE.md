# CLAUDE.md

## Project

Working name: **Legal Document Workspace** (rename as desired — no trademark references).

A local-first legal document workspace built on Anthropic's Claude API. Two interfaces:

1. **Assistant** — chat with one or more loaded documents.
2. **Review** — a tabular grid running the same prompt across multiple documents (rows = docs, columns = prompts).

Runs on a laptop. `pnpm dev` is the entire deploy story.

---

## Thesis (design philosophy — read before writing code)

Harvey and Legora hallucinate and drop instructions more than their marketing suggests. Working theory on why:

- **Breadth kills prompt quality.** Generic system prompts for generic workflows.
- **Abstraction hides the model.** Users can't see or tune what the LLM actually receives.
- **Agentic loops compound errors.** Multi-step chains drift and drop instructions.
- **Cost-optimization erodes reliability.** Cheaper models on volume work.

This project makes the opposite choices on purpose:

- **Narrow workflows**, each with a tuned system prompt.
- **Transparent prompts** — the user can see and edit the system prompt.
- **Single-shot preferred** over agentic chains; one well-scoped call beats four "smart" ones.
- **Opus for the Assistant, Sonnet for grid cells** — don't cost-optimize reliability into the floor.

These are not optimizations. They are the product.

---

## Scope (MVP)

**In:**
- Upload PDF and DOCX files; parse to plain text; persist locally.
- Assistant tab: chat UI, select docs, streaming responses, visible system prompt.
- Review tab: select docs (rows) + define prompt columns, run grid, display results, CSV export.
- Local SQLite persistence for docs and chat history.

**Out (explicit non-goals):**
- Auth / multi-user / cloud deploy.
- RAG / vector DB / embeddings.
- Agent loops / tool use / multi-step chains.
- Real-time collaboration.
- iManage / NetDocs / Westlaw / Practical Law integrations.
- Citation highlighting in source PDF (phase 2 candidate, not MVP).

Non-goals should stay non-goals. Scope creep is the main threat to shipping this.

---

## Architecture

### The critical choice: no RAG

At demo scale (5–50 documents, typically <200k tokens combined), the entire document set fits in Claude's context window. We pass full document text directly in every API call.

**Why:** This eliminates a whole system (vector DB, embeddings, chunking, retrieval tuning) *and* produces better answers because nothing is lost in retrieval. RAG is a technique for working around context limits. At this scale, there is no context limit to work around.

**Tradeoff:** Breaks when combined doc set exceeds ~180k tokens (leaving room for prompt + response). Demo corpora must be curated. Surface a token-count warning in the UI.

### Prompt caching is mandatory for the Review grid

A 10-doc × 5-column grid without caching = 50 full-price API calls, each sending the full document text. With Anthropic's prompt caching, document text is cached on the first hit and subsequent cells against that same document pay ~10% of input cost.

This is not a phase-4 polish item. It is load-bearing in phase 3. Look up Anthropic's current prompt caching documentation before implementing Review (caching headers, TTL, and cache-eligibility rules change; verify against live docs).

---

## Tech stack (with rationale)

- **Next.js 16 (App Router)** — single codebase for UI + API routes. One process to run. (GA Oct 2025; chosen over 15 at scaffold time — greenfield, no migration cost, Turbopack stable by default.)
- **TypeScript** — catches a lot at junior level that would otherwise bite at runtime.
- **Tailwind CSS + shadcn/ui** — neutral professional aesthetic out of the box; Legora-adjacent visual language without custom design.
- **SQLite + Prisma** — zero-setup local DB; Prisma schema is self-documenting.
- **pdf-parse** — PDF → text for native PDFs.
- **mammoth** — DOCX → text.
- **@anthropic-ai/sdk** — direct API client.
- **Vercel AI SDK (`ai` package)** — streaming chat primitives; saves hours on the Assistant tab.

**Not using:** LangChain (wrong abstraction layer for this scope), vector DBs, Docker, auth libraries, Redis.

Before implementing phases that use the Anthropic SDK or the AI SDK, verify current patterns against their live documentation — SDK surfaces change.

---

## Build phases

Execute in order. Each phase ends in a working, demoable state before the next begins.

### Phase 1 — Skeleton + document upload
- Next.js + Tailwind + shadcn initialized.
- Prisma schema: `Document` (id, filename, mimeType, extractedText, tokenCount, createdAt), `ChatSession`, `Message`.
- `/api/upload` endpoint: accept PDF/DOCX, extract text, save to SQLite.
- Sidebar component listing uploaded docs with token counts.

### Phase 2 — Assistant tab
- Chat UI using shadcn + AI SDK `useChat`.
- Document multi-select; selected doc text is injected into the system prompt at the top of each call.
- Streaming responses.
- Visible pills showing which docs are "in context."
- "Show system prompt" dev panel — transparent by design. The user can read and edit the actual system prompt being sent.

### Phase 3 — Review tab
- Grid UI: rows = selected documents, columns = user-defined prompts.
- "Run" button: one API call per cell. Concurrency cap at ~5 parallel requests.
- **Prompt caching enabled on document text.** Non-negotiable.
- Per-cell loading state (spinner is fine; streaming per-cell is a stretch goal).
- Click a cell to view full answer and "Regenerate."
- CSV export of the grid.

### Phase 4 — Polish
- Empty states, error toasts, per-run cost estimate surfaced in UI.
- README with setup instructions.
- Prepare 2–3 curated demo corpora for the side-by-side comparison demos.

---

## Working style

Jordan operates at junior developer level (one intro CS course, actively learning). Treat Jordan as a CEO making strategic calls while you handle implementation detail.

**Workflow: Plan → Build → Review.**

1. **Plan.** Before any code changes, summarize what you're about to do, why, and what could go wrong. Wait for approval.
2. **Build.** Implement the approved plan.
3. **Review.** After each change, explain:
   - *What* changed, in plain language.
   - *Why* the decision was made — not just what the code does.
   - *What could go wrong* — risks, edge cases, assumptions that might break.
   - *Technical debt* introduced, if any.

**Communication norms:**
- Analogies and plain language over jargon.
- Define jargon on first use.
- Flag risks, tradeoffs, and tech debt proactively — not only when asked.
- Prefer one focused change over sprawling multi-file edits.
- Never fabricate API shapes or library behavior. If uncertain about an SDK surface, verify against current docs before writing code.

---

## Known risks (acknowledged upfront)

- **Context ceiling.** Large docs or large doc sets exceed 200k tokens. Mitigation: curated demo corpus, token-count warning in UI, clear error when exceeded.
- **Demo hallucination risk.** The Assistant on an uncurated doc set will show the same failure modes we're critiquing competitors for. Mitigation: pre-test prompts against each demo corpus; queue 2–3 specific side-by-side comparisons.
- **Review grid cost.** Without prompt caching, the grid burns credits fast. Mitigation: caching is phase-3 scope, not polish.
- **PDF parse quality.** `pdf-parse` handles most native PDFs but chokes on scans, complex tables, and heavy layout. Mitigation: document the limit in the UI; if it bites, swap in a hosted parser (LlamaParse, Reducto) behind the same interface.
- **Demoable ≠ productizable.** This is an explicit demo, not a product. Auth, multi-user, and cloud deploy are non-goals and should stay that way.

---

## Environment

- `ANTHROPIC_API_KEY` in `.env.local` (gitignored).
- Node 20+.
- pnpm (package manager — pinned via `packageManager` in package.json).
- `pnpm install`, then `pnpm dev` to start.
- SQLite file gitignored.
- No secrets in code; no telemetry; no external services beyond the Anthropic API.

<!-- PM:START (managed by pm skill — do not edit between markers) -->
## PM-Managed Tasks and Superpowers

When working on a task that has a task file in `.claude/epics/`, check the
task's frontmatter before starting any workflow. The `workflow` fields tell
you which superpowers phases have already been completed and can be skipped.

### Reading the workflow fields

The task frontmatter includes a `workflow` block like this:

    workflow:
      needs_questions: false    # Questions already answered — skip brainstorm
      needs_spec_review: false  # Spec already reviewed — skip spec review
      needs_plan: false         # Plan not needed — skip plan generation
      needs_plan_review: false  # Plan already reviewed — skip plan review

If a field is `false`, that phase is done. Do not re-run it. Do not re-ask
those questions. Proceed to the next phase that is `true`, or go straight
to implementation if all phases are `false`.

There is no flag for superpowers' spec phase itself: whether to write a
design doc before planning is your own judgment at execution time, based on
the task's moving parts. The human review gate (`needs_spec_review`) is
normally already `false` by the time you pick up a task — `/pm:issue-start`
gates on it. Older task files may still carry a `needs_spec` field; it is
deprecated — ignore it.

### Using the Decisions section

If the task file contains a `## Decisions` section, it holds the user's
confirmed answers from a spec review. Treat these as final — they replace
the brainstorm and spec review phases entirely. Do not second-guess them
or ask the user to re-confirm.

Example:

    ## Decisions
    - **[decision] User object location** — A: req.user.
    - **[decision] Public endpoints** — login, register, health only, no others.
    - **[decision] Auth approach** — Supabase gotrue-js, not standalone JWT.
    - **[decision] Token refresh** — client-side only, no server-side refresh.

These are binding. Build to them.

### How this maps to the superpowers sequence

The normal superpowers flow is:

    questions → spec → spec review → plan → plan review → implement

With PM-managed tasks, the flow becomes:

1. Read the task file's `workflow` fields
2. Read the `## Decisions` section if it exists
3. Start at the first phase that is still `true`
4. If all phases are `false`, go directly to implementation

Example: A task with `needs_questions: false`, `needs_spec_review: false`,
`needs_plan: true`, `needs_plan_review: false` means: skip questions, skip
spec review, write a plan, skip plan review, implement. The plan should
incorporate the decisions from the task file without re-asking.

### Enrichment metadata

The task file also contains `model`, `effort`, `complexity`,
`tools_required`, and `env_required` fields. Use these as guidance:

- `model` and `effort` are recommendations for how to configure the session.
- `tools_required` lists CLI tools and MCP connections needed — verify
  they are available before starting implementation.
- `env_required` lists environment variables that must be set — check
  they exist before starting implementation.
- If a required tool or env var is missing, tell the user before proceeding.

### PM owns branch finalization

PM tasks are built in PM-managed git worktrees, and `/pm:ship` is the single
finalizer. When you finish implementing a PM task and reach superpowers'
`finishing-a-development-branch` step, choose **"Keep the branch as-is, I'll
handle it later."** Do **not** merge, open a PR, delete the branch, or remove
the worktree yourself.

First, when the final whole-implementation review passes, **record the
review marker** — set `reviewed_sha` in the task frontmatter to the
reviewed HEAD and commit it as its own logical unit:

    sha="$(git rev-parse HEAD)"
    # set `reviewed_sha: $sha` in .claude/epics/<epic>/<n>.md frontmatter
    git add .claude/epics/<epic>/<n>.md
    git commit -m "chore: mark #<n> reviewed at ${sha:0:7}"

Skipping this leaves `/pm:ship`'s review gate owing a full re-review, and
under auto-ship the pipeline never ships at all.

Then **park the dispatch marker** so fleet surfaces
(the floor, `/pm:status`) show the task as ready-to-ship:

    bash ~/.claude/skills/pm/references/scripts/dispatch-marker.sh \
      write <worktree-path> parked "ready for /pm:ship"

and tell the user the worktree is ready and to run `/pm:ship <n>`.
Shipping — merge → push → verification gate → code-review gate →
cleanup — is PM's job, not the inner loop's.
<!-- PM:END -->
