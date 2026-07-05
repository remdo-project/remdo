---
name: remdo-docs-align
description: Use to converge documentation and skill files to the documentation intent and invariants (docs/documentation.md) over a chosen scope — deterministic gates, an align pass, then a cross-family deletion advocate whose proposals are adjudicated under the face-value tie-breaker. Triggers include "align the docs", "run docs-align", a corpus realignment, or remdo-refine handing over a doc-heavy diff.
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
  changes), a committed range (resolved via `tools/skills/resolve-scope.sh` —
  an immutable base SHA plus the touched-file list), or an explicit file set
  (e.g. the whole corpus for a realignment). A diff scope selects its touched
  files, read whole.

## Pipeline

Each stage has file-shaped inputs and outputs and can run alone; together
they run in this order.

1. **Gates.** Run `pnpm run lint:md` — the markdown static checker (style
   lint plus the link/anchor and wording rules) — and fix to clean. (The
   deterministic wording gate covers `docs/` prose only; skill-file prose is
   covered by the align/advocate stages, not the gate.) On a scope
   narrower than the corpus,
   clean means no new findings versus the pre-run baseline; pre-existing
   out-of-scope findings go to the stage-5 report.
2. **Align pass.** An editor fixes the remaining rule violations across the
   scope, re-running the gates after each batch.
3. **Advocate.** Run `sh tools/skills/advocate-run.sh <rules-doc> <scope>
   <output-file>` (its header states the full contract). It substitutes the
   scope and rules doc into `references/advocate.md` and runs the read-only
   deletion advocate via `codex exec` in a read-only sandbox — a different
   model family than the editor — capturing the numbered proposal table to
   the output file. On a non-zero exit (the retry also failed), surface it in
   the stage-5 report rather than proceeding to adjudicate an empty table.
4. **Adjudicate.** The editor applies `references/adjudicate.md` over the
   proposal table. Gates re-run after the edits.
5. **Report.** What changed; the per-proposal disposition list;
   and an ESCALATE table (rule conflicts, borderline keeps) addressed to the
   user or a stronger-model pass — escalation is an output of this skill,
   not a failure.

Forward the `AGENTS.md` findings-suppression rule to every stage.

## Boundaries

- `remdo-simplify` is the general read-only finder; this skill's advocate is
  its adversarial, deletion-only counterpart for rules-governed prose.
- `remdo-refine` owns the general quality ladder; its ladder defines when a
  diff is handed to this skill.
- Authoring new content is out of scope: write-time rules do not prevent
  redundancy (tested — they made it worse), so fresh text is aligned by
  running stages 3–4 over it after writing.

## Permissions

Invoking this skill on a **committed-range scope** is an explicitly declared
autonomous scope (per AGENTS.md): authorization to commit each stage's applied
edits **on the current branch**, keeping the resolved range honest — never onto
`main` (if invoked there, warn and stop rather than self-committing), and never
push. In **working-tree scope** it commits nothing — the applied edits stay in
the tree and the user owns the eventual commit. `git fetch` is always allowed;
pull, force-push, and opening PRs stay the user's.
