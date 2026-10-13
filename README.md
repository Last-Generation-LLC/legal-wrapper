# Legal Document Workspace

A local, self-hosted **Bring Your Own Model (BYOM)** legal document workspace
built on the Anthropic Claude API. It is a lightweight, transparent alternative
to the expensive, heavily-marketed legal-AI tools — you run it on your own
laptop, you bring your own API key, and you can see exactly what the model
receives. Built by a lawyer; no celebrity endorsements. This is a work in
progress, with more features on the way.

It has two interfaces:

- **Assistant** — chat grounded in one or more of your documents. The system
  prompt is **visible and editable**, so nothing about the request is hidden
  from you.
- **Review** — a grid that runs the same prompt across many documents at once
  (rows = documents, columns = prompts) and exports the results to CSV.

Everything runs locally. Your documents stay in a local SQLite database, and the
only external service is the Anthropic API.

## Prerequisites

- **Node 20.19+, 22.13+, 24, or 26** (use the latest patch of your chosen major).
- **[pnpm](https://pnpm.io/)** — the package manager for this project.
- **An Anthropic API key** — get one at
  <https://console.anthropic.com/settings/keys>.

## Setup

### 1. Install dependencies

```bash
pnpm install
```

This also runs `prisma generate` (via the `postinstall` hook) to build the
database client.

### 2. Add your API key

Copy the example env file and paste in your key:

```bash
cp .env.local.example .env.local
```

Then open `.env.local` and set:

```
ANTHROPIC_API_KEY=sk-ant-...
```

`.env.local` and other `.env.*` files are gitignored; the empty
`.env.local.example` stays tracked. Never force-add a real environment file.

### 3. Set up the database

```bash
pnpm db:migrate
```

This creates the local SQLite database (`prisma/dev.db`) and applies the
schema. The database file is gitignored and stays on your machine.

## Run

```bash
pnpm dev
```

Then open <http://localhost:3000>.

## Using it

1. **Upload documents.** Add PDF or DOCX files from the sidebar. Each document is
   parsed to plain text and stored locally, with a token count shown next to it.
2. **Assistant.** Select one or more documents to bring them into context, then
   ask questions. Answers stream in with citations and a confidence indicator.
   Open the system-prompt panel to read — and edit — the exact prompt being sent
   to the model.
3. **Review.** Pick documents as rows and define prompt columns, then run the
   grid. Each cell is one model call; results fill in as they complete. Click a
   cell to see the full answer, or export the whole grid to CSV. Use **Re-run row**
   beside a document or **Re-run column** in a column's header menu to refresh
   just those cells, including completed answers, with the selected model.
   These actions make new API calls. Rough estimates appear beside the actions;
   the latest run's summary shows costs calculated from successful response usage.
   **Run all** continues to skip unchanged completed cells.

## Running a demo

If you want to show the workspace off, [`docs/demo-script.md`](./docs/demo-script.md)
walks through three demos and the corpora that suit them, and
[`docs/prompt-testing.md`](./docs/prompt-testing.md) is a checklist for testing
your prompts ahead of time. Your demo documents live in a local `demo-corpora/`
folder, which is gitignored — keep them on your machine, not in the repo.

## Known limits

- **Context ceiling (~180k tokens).** There is no retrieval step — the full text
  of every selected document is sent on each call. The UI warns as a request
  approaches the ceiling and shows a clear error past it. Keep document sets
  curated.
- **PDF parsing.** Text extraction handles most native PDFs well but struggles
  with scanned pages, complex tables, and heavy layouts. DOCX files are
  generally cleaner.
- **Demo, not production.** This is a local single-user tool by design. There is
  no authentication, no multi-user support, and no cloud deployment.

## Development checks

```bash
pnpm lint
pnpm exec tsc --noEmit
pnpm test
```

The **CI** GitHub Actions workflow runs these checks on Node 20, 22, 24, and 26
for pushes and pull requests. Tests use mocked API calls and need no Anthropic
key or local database. CI installs the pnpm version pinned in `package.json`
with a frozen lockfile; allowed dependency install scripts are listed in
`pnpm-workspace.yaml`.

## Secret checks

The **Secret scan** GitHub Actions workflow runs Gitleaks on all fetched Git
history for pushes and pull requests. Findings fail the check, and secret
values are redacted from its output. It requires no API key or paid Gitleaks
Action license. This check detects committed secrets after a push; enable
GitHub push protection separately when available for the repository.

To scan committed history locally with [Gitleaks](https://github.com/gitleaks/gitleaks)
8.30.1 installed:

```bash
gitleaks git . --log-opts="--all --full-history" --redact=100 --ignore-gitleaks-allow
```

This command does not check uncommitted files. Keep local environment files,
`.next/`, databases, and `demo-corpora/` out of shared archives as well as Git.
If a real key is committed, revoke or rotate it; deleting the current file
does not remove it from history.

## License

[MIT](./LICENSE). Copyright (c) 2026 Last Generation, LLC.

### Saved Assistant sessions

The **Sessions** button opens the current and archived chat list inside Assistant.
Open a saved chat to restore its messages and document selection, rename it inline,
or delete it after confirmation. Deleting the current chat opens an empty replacement;
deleting an archive leaves the current chat alone. Deletion cannot be undone.

**New session** archives the current conversation. Switching or starting a session
stops any unfinished answer and clears the unsent draft; completed messages remain
saved. Document selection is saved when sending or switching, and documents that
no longer exist are omitted when reopening. The editable system prompt remains a
workspace setting, not part of each saved chat. If another browser tab changes the
active session, reload the stale tab before sending again.


### Assistant prompt templates

Open **Show prompt** to switch between **General legal** and the original
**Contract review** preset. Both remain fully editable; **Reset** restores the
selected template's saved text. **Save as new** saves your current text as a named
custom template in the local SQLite database. Custom templates support **Save
changes**, **Rename**, and **Delete**; built-ins cannot be overwritten or deleted.
Switching away from unsaved edits and deleting a template require confirmation.
Names may contain 1–120 characters; saved prompts must be nonblank and at most
100,000 characters. Renaming preserves unsaved prompt edits.

The selected name stays visible beside Show/Hide prompt. The selection and edits
survive hiding the panel and switching chat sessions. Reload starts with General
legal and discards unsaved edits; saved custom templates remain available. Deleting
a template leaves chat messages intact and selects General legal. Changes apply to
subsequent requests, including retries and regeneration. The document expansion
and fixed citation instructions remain visible in the prompt panel.

Existing checkouts must run `pnpm exec prisma migrate deploy` and
`pnpm exec prisma generate` after updating to add the template table. This migration
preserves existing documents and chats. Templates belong to this local workspace;
concurrent edits from multiple tabs use the last successful save.
