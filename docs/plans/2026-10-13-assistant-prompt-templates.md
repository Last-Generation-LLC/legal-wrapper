# Assistant prompt templates — issue #28

## Goal
Offer reusable Assistant system prompts while keeping the complete prompt visible and editable. Start with General legal and the preserved Contract review prompt, verbatim. Users can save edits as named custom templates, update their content, rename them, and delete them.

## Decisions
- Built-in presets live in code and cannot be overwritten or deleted. Custom templates live in a new SQLite `PromptTemplate` table (id, name, content, createdAt, updatedAt).
- The current selection and unsaved edits remain in memory across session switches and hiding the panel. Reload starts with General legal; saved custom templates survive reload. No per-session prompts or tool configuration.
- Show the selected template name beside the existing Show/Hide prompt control. Inside the panel, show preset/custom groups, edited status, save-copy and custom update/rename/delete controls.
- Require explicit confirmation before replacing unsaved edits by switching, or before deleting a custom template. Reset restores the selected saved template. Failed writes preserve the draft and display an actionable error.
- Preserve exact prompt content, including whitespace; trim names only. Reject blank content, names outside 1–120 characters, and content over 100,000 characters. Allow duplicate names (IDs identify templates).
- Saved templates store the editable text only. Document expansion, blank fallback, and the visible fixed citation appendix stay unchanged. Sending uses the current editor text for sends, retries, and regeneration.
- Disable template mutations and editing while a response or session switch is in progress. Serialize saves locally. Missing custom records return 404; saving a copy recovers a stale/deleted template. Multi-tab concurrent edits are last-write-wins, consistent with the single-user workspace.

## Implementation sequence
1. Add a shared preset catalog and validation/types, additive Prisma model/migration, store functions, and a validated GET/POST API for list/create/update/rename/delete.
2. Seed custom templates from the Assistant server page. Add a persistent editor component around the existing prompt panel, reusing Btn, Pill, input styles, and existing tokens. Keep the selected label visible when collapsed.
3. Cover CRUD and migration behavior with a disposable SQLite database; test API validation/errors, unsaved changes, persistence/reload seeds, failed saves, rename/delete confirmation, and actual outgoing chat prompt content.
4. Update README; run focused tests, full tests, lint, TypeScript, and diff checks. Inspect the final changes. Record completion and remaining shipping steps in the shared backlog.

## Validation and limits
No live model calls are needed. Test migrations against disposable databases before applying the additive migration locally. No new package or hosted service. The 21st CLI is unavailable, so use the established project components and styling. A browser preview is desirable if browser tooling is available; DOM behavior tests are the baseline.

## Implementation result

Implemented the preset selector, custom template CRUD, selected-name display,
unsaved-edit and deletion confirmations, and immutable built-ins. Reused the
existing Btn and PromptPanel components and design tokens. The expanded panel is
height-bounded and scrollable to keep chat controls accessible.

Validation: 409 tests across 46 files pass, including disposable SQLite migration
and persistence tests and an actual useChat request-body test; lint, TypeScript,
and diff checks pass. Applied the additive migration locally and regenerated
Prisma Client; existing document/session/message counts are unchanged. No live
model requests, new dependencies, or hosted services. 21st CLI and browser tools
were unavailable, so no visual browser review was performed.

Changes are local, ready for review and shipping when authorized. The documented
limits are deliberate: selection resets on reload; concurrent template writes
are last-write-wins; saved prompts do not include per-session configuration.
