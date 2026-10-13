# Review row and column re-runs — issue #30

## Goal
Re-run one selected document across all prompt columns, or one prompt across all selected documents, including already-completed cells. Preserve every other result and the selected model.

## Implementation
1. Add an explicit force option to the existing grid runner. Continue skipping in-flight cells, warming each document with its first request, and enforcing the global concurrency cap. Keep Run all's existing skip semantics.
2. Add a Re-run row button beside each document and a Re-run column action inside the existing column editor/menu. Show a rough subset estimate before activation using the existing model rate registry. Assume cold cache writes, 1,000 overhead tokens plus prompt length, and 512 output tokens per cell; state these assumptions and that this is not a ceiling. Do not promise cache savings.
3. Track successful response costs and failed/skipped cells separately for the latest run. Label costs as reported successful-response usage, since failed requests can have unreported charges. Keep the existing grid-wide result costs.
4. Share a synchronous run lock across Run all, row/column actions, and inspector regeneration. Freeze model/column changes during calls. Capture each run's document/column subset so sidebar changes cannot redirect in-flight work.
5. Add runner and UI regression tests covering forced scope, unchanged Run all behavior, cache warming, failures, concurrent-run prevention, selected model, estimates and usage summaries.

## Validation
Run focused tests, then lint, TypeScript, and the full test suite. No live Anthropic requests or local database changes. 21st CLI is unavailable; reuse the existing Btn, tokens, and column editor. Commit/push/merge are outside this implementation request.
