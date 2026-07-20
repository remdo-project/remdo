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

Run the adapters exactly as provided; each owns its reviewer-specific target,
prompt, permissions, isolation, and output parsing. Successful stdout is the
final report. Classify a missing reviewer as unavailable and any other non-zero
adapter result as failed; treat its output as diagnostic, not as findings.
The Claude adapter uses medium effort.

## Report

Return the result exactly as defined by the authoritative specification's
[Result](../../../spec/skills/remdo-verify-change.md#result) section.
