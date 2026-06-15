# Prompt testing

A manual test pass for the demo prompts. Run these yourself, against your own
`demo-corpora/`, **before** any live demo — the point is to catch a bad answer in
private rather than on stage.

This is deliberately manual. Each row is one model call that costs tokens, so you
control the spend: run a row, eyeball the answer against the "expected outcome"
column, and mark it. Don't paste full transcripts here — model output varies
between runs. You're checking the *shape* of the answer (right facts, right
format, honest about gaps), not matching exact words.

## How to use this

1. Load the relevant corpus and set up the tab (Assistant or Review) as noted.
2. Run the prompt.
3. Compare against **Expected outcome (shape)**.
4. Mark **Result**: ✅ pass · ⚠️ shaky (works but weak) · ❌ fail.
5. If ⚠️ or ❌, note what went wrong and adjust the prompt (Assistant) or the
   tuned system prompt before the demo.

A prompt that only passes intermittently is a ⚠️, not a ✅ — treat it as a fail
for demo purposes and either fix it or drop it from the script.

---

## Corpus A — Vendor MSA set (Review grid)

Set up the MSAs as rows, add each prompt below as a column, run the grid.

| # | Column prompt | Tab | Expected outcome (shape) | Result | Notes |
|---|---------------|-----|--------------------------|--------|-------|
| A1 | What is the governing law? | Review | A jurisdiction per cell (e.g. "Delaware"); "Not specified." where silent | | |
| A2 | What is the liability cap? | Review | A figure or formula (e.g. "12 months of fees"); "Not specified." where silent | | |
| A3 | What is the termination notice period? | Review | A duration (e.g. "30 days"); "Not specified." where silent | | |
| A4 | Is there an auto-renewal clause? If so, what are the terms? | Review | Yes/no + the term where present; "Not specified." where silent | | |

**Watch for:** a cell that *guesses* on a silent document instead of returning
"Not specified." — that is the failure mode to catch.

---

## Corpus B — NDA pair (Assistant, both selected)

Select both NDAs so they're in context.

| # | Prompt | Tab | Expected outcome (shape) | Result | Notes |
|---|--------|-----|--------------------------|--------|-------|
| B1 | What are the material differences between these two NDAs? | Assistant | A numbered list of real, document-grounded differences with clause citations | | |
| B2 | Which one is more favorable to the receiving party, and why? | Assistant | A clear answer with reasoning tied to specific clauses | | |
| B3 | Does either NDA include a non-solicitation clause? | Assistant | Per-document yes/no with a citation; explicit "no" where absent | | |

**Watch for:** differences asserted without a citation, or a citation that points
at the wrong document.

---

## Corpus C — Long agreement (Assistant, single doc)

Select the one long agreement.

| # | Prompt | Tab | Expected outcome (shape) | Result | Notes |
|---|--------|-----|--------------------------|--------|-------|
| C1 | Summarize the payment terms. | Assistant | Amounts, cadence, and due dates as stated, with citations | | |
| C2 | What happens on early termination? | Assistant | The termination mechanics + any fees/notice, cited | | |
| C3 | List every defined term used in the indemnification section. | Assistant | Defined terms actually present; honest if the section is absent | | |
| C4 | (Transparency demo) Edit the system prompt, then re-ask C1. | Assistant | Output visibly reflects the edit — proves the panel is live | | |

**Watch for:** hallucinated page numbers or citations the document can't support;
the token meter should also be visibly climbing on this corpus.

---

## Sign-off

Before the demo, every row you intend to show should be ✅. Keep a note of the
date and which corpora you tested against — if you re-curate a corpus, re-run its
rows.

- Tested on: ______________________
- Corpora versions / sources: ______________________
