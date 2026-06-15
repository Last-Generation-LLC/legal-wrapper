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

- **Node 20+**
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

`.env.local` is gitignored — your key never gets committed.

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
   cell to see the full answer, or export the whole grid to CSV.

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
