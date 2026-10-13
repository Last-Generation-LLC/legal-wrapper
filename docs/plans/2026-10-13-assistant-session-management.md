# Assistant session management — issue #26

## Outcome
Browse current and archived chats from a collapsible Sessions panel beneath the Assistant toolbar. Reopen a conversation with its saved messages and document selection, rename it, or permanently delete it after an explicit inline confirmation. Keep the document sidebar unchanged and reuse Btn, panel, border, and typography tokens.

## Implementation
1. Extend the existing chat store and session API: list metadata (title, creation time, message count), validate trimmed names (1–120 characters), and atomically open/create/delete sessions. Opening archives the current session; deleting the current session creates an empty replacement. Missing targets must not alter the active chat. No schema migration.
2. Bind every model request to its explicit session ID. Reject stale/inactive sessions before invoking the model, forward request cancellation to the model, and skip persistence after cancellation. Responses remain bound to their original session. Preserve finished messages; interrupted partial responses are not saved, matching existing persistence behavior.
3. Add a compact, scrollable Sessions panel with current/archived labels, dates, counts, inline rename and delete confirmation, empty/loading/error states, and keyboard-accessible controls. Unnamed chats use a date plus short ID to distinguish them.
4. Serialize client session actions with a synchronous lock; stop streaming before switching or deleting the current chat. Disable send/regenerate while changing sessions. Apply messages and document selection only after a successful response; preserve the current view on errors. Save the outgoing document selection during switches, omit documents no longer available on restoration, and clear drafts/edit state only on successful changes. Keep the editable system prompt as a workspace setting.
5. Document behavior in README and cover store/API/UI flows with focused regression tests; run lint, TypeScript, and the complete test suite.

## Boundaries and tradeoffs
Local single-user workspace only. No cloud sync, search, pagination, per-session system prompts, or resumable streams. The list is bounded visually by scrolling, not by truncating database results. Switching discards an unsent draft and any unfinished answer; show this before the action. Deletion removes messages via the existing database cascade and cannot be undone. Concurrent browser tabs can hold stale sessions; explicit session IDs reject stale sends instead of overwriting the newly active conversation.

## Validation
Test ordered restore, archived reopen, active/archived deletion, invalid names/missing IDs, transaction rollback, document selection preservation, failed switches, duplicate clicks, and switching during streaming. Check that a canceled request cannot append into a deleted or different session. No live Anthropic calls or mutations of the user's existing database are needed.

## Implementation result — 2026-10-13

Implemented the session panel, metadata listing and session actions, explicit session IDs on chat calls, atomic stale-session checks, model cancellation, and restored document selection. Reused existing Btn and theme tokens; 21st CLI initialization/search/review were unavailable (`command not found`). No dependencies or database migration added.

Validation: `pnpm lint`, `pnpm exec tsc --noEmit`, `git diff --check`, and all 378 tests across 43 files pass on Node 26. Includes UI tests using the actual useChat hook, API cancellation and validation tests, and isolated SQLite integration tests proving message cascade and rollback of failed writes/deletion. No live model call or browser visual review was performed. Changes remain local for review and shipping.
