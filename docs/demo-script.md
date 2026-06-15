# Demo script

How to run a clean, repeatable demo of the workspace. The goal of the demo is
narrow and deliberate: show that a **local, transparent, Bring Your Own Model
(BYOM)** tool does the core job of the expensive, heavily-marketed legal-AI
products — load documents, chat with them, and run one prompt across many at
once — with nothing hidden from the user. We are **not** running a side-by-side
bake-off and we are **not** making a reliability claim here; the message is
simply *self-hosted, transparent, and bring-your-own-model.*

## Before you start

- The app is running (`pnpm dev`) and your `ANTHROPIC_API_KEY` is set.
- Your demo documents are sitting in a local `demo-corpora/` folder. That folder
  is gitignored on purpose — the documents live only on your machine, so curate
  whatever set you trust and keep it out of the repo.
- Each corpus stays comfortably under the ~180k-token context ceiling. Watch the
  per-document token counts in the sidebar as you upload.

## The three corpora

Each corpus is shaped to show off a specific part of the product. Source them
from public filings (e.g. SEC EDGAR) where you want documents that read as real,
and fall back to synthetic examples where you want a clean, controlled case.

| Corpus | Shape | Demos | Why it fits |
|--------|-------|-------|-------------|
| **Vendor MSA set** | 3–4 short Master Service Agreements from different "vendors" | **Review grid** | Many documents, same questions — exactly what the grid is for. |
| **NDA pair** | One mutual NDA + one one-way NDA | **Assistant** (compare) | Two documents with real, explainable differences to surface. |
| **Long agreement** | One longer agreement (e.g. a SaaS subscription or commercial lease, ~15–30 pp) | **Assistant** (deep Q&A) | Enough length to show grounded answers and the token meter doing its job. |

## Demo 1 — Review grid (Vendor MSA set)

The headline demo. It shows the product doing in seconds what would otherwise be
hours of manual cross-document review.

1. Upload the 3–4 MSAs.
2. Switch to **Review**. Add the MSAs as rows.
3. Add prompt columns — a good starting set:
   - "What is the governing law?"
   - "What is the liability cap?"
   - "What is the termination notice period?"
   - "Is there an auto-renewal clause? If so, what are the terms?"
4. Run the grid. Cells fill in independently.
5. Click any cell to show the full answer, then **export to CSV**.

**What to point at:** every cell is one plain model call, document text is cached
so the grid is cost-viable, and the answer for a silent document comes back as
"Not specified." rather than a guess.

## Demo 2 — Assistant compare (NDA pair)

Shows grounded, cited answers across two documents.

1. Upload both NDAs.
2. In **Assistant**, select both so they're in context.
3. Ask: *"What are the material differences between these two NDAs?"*
4. Follow up: *"Which one is more favorable to the receiving party, and why?"*

**What to point at:** the answer cites specific clauses, and the differences are
explained — not just listed.

## Demo 3 — Assistant deep dive (Long agreement)

Shows depth on a single long document and the transparency feature.

1. Upload the long agreement and select it.
2. Ask a few targeted questions, e.g. *"Summarize the payment terms,"* then
   *"What happens on early termination?"*
3. **Open the system-prompt panel.** This is the differentiator: show that the
   prompt is fully visible and editable, then make a small edit and re-ask to
   show the output change.
4. Note the token meter as the document fills the context.

**What to point at:** there is no hidden orchestration — what you see in the
panel is exactly what the model receives.

## The closing line

A local, transparent, bring-your-own-model tool that covers the core workflow —
no per-seat enterprise pricing, no black box, and a roadmap of features still to
come.

> Before any live demo, walk the prompts in [`prompt-testing.md`](./prompt-testing.md)
> against your actual corpora so nothing surprises you on stage.
