---
name: remdo-verify-change
description: Verify one explicitly selected RemDo working-tree or Git-range scope with repository checks followed by fresh Codex and Claude reviews. Use when the user or another workflow asks to verify, inspect, or independently review a completed repository change without editing, approving, committing, or advancing its lifecycle.
---

# RemDo Verify Change

Verify one explicit scope under the authoritative
[`remdo-verify-change`](../../../spec/skills/remdo-verify-change.md) contract.
Remain read-only: do not edit, stage, commit, or run checks intended to change
the selected scope.

## Resolve the scope

Require exactly one caller-supplied scope: `working-tree` or an explicit
`<left>..HEAD` / `<left>...HEAD` Git diff range. Do not infer a default.
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

Use these adapters:

- Codex: `sh .agents/skills/remdo-verify-change/tools/run-codex-review.sh
  working-tree` or replace the last argument with `committed-range <BASE>`.
- Claude: `sh .agents/skills/remdo-verify-change/tools/run-claude-review.sh
  working-tree` or replace the last argument with
  `committed-range <BASE> <HEAD_SHA>`.

Run the adapters exactly as provided. Each builds its closed provider request
for the shared
[`read-only agent runner`](../_shared/tools/read-only-agent-runner.ts), which
owns the fresh session, safety boundary, cancellation, protocol completion,
and final-response extraction. The provider fronts retain verifier-specific
scope construction and instructions. Claude's front validates its explicit
completion field; the executing verifier interprets Codex's text as described
below.

Reviewer runtime is unspecified. Wait for each managed call's completion
notification; do not poll it or interpret silence or elapsed time as failure.
Cancel a review only when the caller or enclosing lifecycle explicitly abandons
it.

Exit status `2` means the provider or its declared native review capability is
unavailable. Any other non-zero result is
failed; treat its output as failure evidence, not as findings. Exit status `0`
carries the final response. Claude's adapter has already proved explicit completion.
For Codex, interpret the whole report: classify it as completed only when it
represents inspection of the full selected scope. If it states or leaves
unresolved that full-scope inspection did not occur, classify Codex as failed
and use the report as failure evidence. Do not substitute a fixed phrase list
for this semantic judgment. The Claude adapter uses medium effort.

## Report

Return the result exactly as defined by the authoritative specification's
[Result](../../../spec/skills/remdo-verify-change.md#result) section.
