---
name: remdo-docs-align
description: Use to converge documentation and skill files to the documentation intent and invariants (docs/documentation.md) over a chosen scope — deterministic gates, an align pass, then a cross-family deletion advocate whose proposals are adjudicated under the face-value tie-breaker. Triggers include "align the docs", "run docs-align", or a corpus realignment.
---

# Docs align

## Overview

Converge a documentation scope to its rules doc through staged, separable
passes. The staging and prompt wording are experiment-validated: the
deletion-warrant defects that single-model review reliably keeps (and even
strengthens) are fixed by the advocate/adjudicate pair with the face-value
tie-breaker, so preserve that structure when editing this skill.

## Scope and inputs

- **Rules doc**: `docs/documentation.md` unless the caller names another
  with equivalent carve-outs (the templates assume its carve-out structure).
- **Scope**, fixed at invocation: the working tree (uncommitted doc
  changes), a committed range (resolved via
  `.agents/skills/remdo-refine/tools/resolve-scope.sh`, whose header states the
  contract), or an explicit file set (e.g. the whole corpus for a realignment).
  A diff scope selects its touched files, read whole.
- Authoring new content is out of scope: write-time rules do not prevent
  redundancy (tested — they made it worse), so fresh text is aligned by
  running stages 3–4 over it after writing.

## Pipeline

Each stage has file-shaped inputs and outputs and can run alone; together
they run in this order.

1. **Gates.** Run `pnpm run lint:md` (the product's style/link gate) and
   `sh .agents/skills/remdo-docs-align/tools/check-doc-rules.sh` (this
   skill's private doc-invariant rules — temporal wording, References shape —
   over `docs/` prose; skill-file prose is covered by the align/advocate
   stages, not the gates) and fix to clean. On a scope
   narrower than the corpus,
   clean means no new findings versus the pre-run baseline; pre-existing
   out-of-scope findings go to the stage-5 report.
2. **Align pass.** An editor fixes the remaining rule violations across the
   scope, re-running the gates after each batch.
3. **Advocate.** Run the Codex advocate:
   `sh .agents/skills/remdo-docs-align/tools/advocate-run.sh <rules-doc> <scope>
   <output-file>` — invoke the script directly in exactly that form, in the
   foreground; MUST NOT wrap it in a helper script, background it, or
   re-implement its steps (a backgrounded run is orphaned when a headless
   session ends its turn). Use a repo-local `<output-file>` such as
   `.agent/tmp/advocate.txt` (headless editors cannot read `/tmp`); the
   script header states the full contract. It captures the numbered proposal
   table. On a non-zero exit (the retry also failed), surface it in the stage-5
   report rather than proceeding to adjudicate an empty table. On
   `PROPOSALS=none` (the advocate emitted its `NO PROPOSALS` sentinel — a clean
   no-op on an already-minimal scope), skip stage 4 and note the no-op in the
   report; there is nothing to adjudicate.
4. **Adjudicate (dual).** First the coordinating session suppresses: it drops
   table entries matching the standing-keeps ledger on BOTH keys — the
   proposal's file equals the entry's file, and the quoted text matches
   (whitespace-normalized substring); the same words in a different doc are a
   different proposal and MUST NOT be suppressed. (User-settled keeps; report
   the count — removing a ledger entry is how a keep is reopened.) The ledger
   lives in a machine-local checkout of the `remdo-docs-qa` bench repo — a sibling
   of the RemDo checkout (same parent directory); if absent, suppression is
   unavailable (degraded mode) and the run proceeds without it. If suppression
   empties the table, skip the adjudicators and report it like `PROPOSALS=none`
   — there is nothing left to adjudicate.
   Otherwise two independent, fresh, contextless adjudicators
   — never the session that ran stages 1-3 — each produce verdict-only
   dispositions over the remaining table per `references/adjudicate.md`,
   without editing anything or seeing each other. Mechanically diff the two
   verdict lists: agreed APPLYs are applied by the editor, agreed REJECTs
   are recorded, and every disagreement becomes an ESCALATE row — decided by
   the user, never in-run. Gates re-run after the edits. (Measured basis:
   single-session verdicts flip on ~15% of proposals between identical runs;
   the dual diff converts that variance into explicit escalations.)
   This stage authorizes subagents when they are the runtime's fresh-context
   mechanism; the independence requirement is enough reason to use them without
   asking again.
5. **Report.** What changed; the per-proposal disposition list;
   and an ESCALATE table (rule conflicts, borderline keeps) addressed to the
   user or a stronger-model pass — escalation is an output of this skill,
   not a failure.

Forward the `AGENTS.md` findings-suppression rule to every stage.


## Permissions

Commit authority follows the resolved scope, not the caller.

A **committed-range scope** is an explicitly declared autonomous scope (per
AGENTS.md): authorization to commit each stage's applied edits **on the current
branch**, keeping the resolved range honest — never onto `main` (if invoked
there, warn and stop rather than self-committing), and never push. An **explicit
file-set scope** (e.g. a whole-corpus realignment) is treated the same as a
committed-range: commit each stage's edits on the current branch. In
**working-tree scope** it commits nothing — the applied edits stay in the tree
and the caller owns the eventual commit.
