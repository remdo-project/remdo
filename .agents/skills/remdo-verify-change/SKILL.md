---
name: remdo-verify-change
description: Verify one explicitly selected RemDo working-tree or Git-range scope with repository checks followed by fresh Codex and Claude reviews. Use when the user or another workflow asks to verify, inspect, or independently review a completed repository change without editing, approving, committing, or advancing its lifecycle.
---

# RemDo Verify Change

Verify one explicit scope under the authoritative
[`remdo-verify-change`](../../../docs/spec/skills/remdo-verify-change.md)
contract.
Remain read-only: do not edit, stage, commit, or run checks intended to change
the selected scope.

## Resolve the scope

Accept exactly one caller-supplied scope as `working-tree`, an explicit
`<left>..HEAD` / `<left>...HEAD` Git diff range, or an unambiguous description
that maps to one of them. Translate a description to its supported input before
running the resolver. Ask the caller when their intent does not determine one
exact input; do not infer a scope from silence.
For `working-tree`, stop unless `git symbolic-ref --quiet --short HEAD`
succeeds.

Run the [shared scope resolver](../_shared/tools/resolve-scope.sh) from the
repository root:

```sh
sh <shared-resolver-path> <scope>
```

Stop on a non-zero exit or an empty `FILES` section. Retain the emitted
`SCOPE`, immutable `BASE` and `HEAD_SHA`, and file list. Checks and reviewers
must inspect this selected scope; the caller owns its stability.

## Run deterministic checks

Run the final repository check prescribed for the agent mode and scope:

- local `working-tree`: `pnpm run check`
- cloud agents or a committed range: `pnpm run check:full`

If the command fails, report its command and outcome, then stop before invoking
reviewers.

## Run fresh reviews

After checks pass, attempt fresh Codex and Claude reviews concurrently through
the runtime's managed parallel-call surface. Never shell-background either
process. Do not substitute another reviewer when one is missing or fails, and
do not abort the other review.

Invoke the shared runner directly with high effort:

- Codex: `node .agents/skills/_shared/tools/read-only-runner.ts --effort high
  codex review working-tree` or replace `working-tree` with
  `committed-range <BASE>`.
- Claude: `node .agents/skills/_shared/tools/read-only-runner.ts --effort high
  claude review working-tree` or replace `working-tree` with
  `committed-range <BASE>`.

Run these commands exactly. The
[`read-only runner`](../_shared/tools/read-only-runner.ts) owns the fresh
session, review scope mapping, safety boundary, cancellation, protocol
completion, and final-response extraction.

Reviewer runtime is unspecified. Wait for each managed call's completion
notification; do not poll it or interpret silence or elapsed time as failure.
Cancel a review only when the caller or enclosing lifecycle explicitly abandons
it.

Exit status `2` means the provider or its declared native review capability is
unavailable. Any other non-zero result is
failed; treat its output as failure evidence, not as findings. Exit status `0`
carries the final response. Interpret each whole report: classify it as
completed only when it represents inspection of the full selected scope. If it
states or leaves unresolved that full-scope inspection did not occur, classify
that review as failed and use the report as failure evidence. Do not substitute
a fixed phrase list for this semantic judgment.

## Report

Return the result exactly as defined by the authoritative specification's
[Result](../../../docs/spec/skills/remdo-verify-change.md#result) section.
