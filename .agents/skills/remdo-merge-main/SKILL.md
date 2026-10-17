---
name: remdo-merge-main
description: Merge the latest fetched origin/main into the current attached branch from a clean working tree, resolving determined conflicts and verifying non-fast-forward integration without rebasing or remote mutation. Use when the user asks to merge, sync, or update the current RemDo branch from main.
---

# RemDo Merge Main

Implement the authoritative [`remdo-merge-main`](../../../docs/specs/agents/skills/remdo-merge-main.md) contract.

## Start

Set `runner` to `.agents/skills/remdo-merge-main/tools/merge-main.sh`. Run
`sh "$runner" start`.

Retain `TARGET` from the runner output for this run:

- `up-to-date` and `fast-forwarded` are complete.
- `conflicted` continues under [Merge conflicts](#merge-conflicts).
- `merge-ready` continues under [Verification](#verification).
- Any failure is terminal. Report its output.

Concurrent repository mutation and recovery after an unexpected interruption
are unsupported. Do not construct a parallel run journal or infer a resumable
skill phase.

## Merge conflicts

Resolve a merge conflict only when intended behavior and repository evidence
determine the result. Inspect both sides and their authoritative contracts.
Stage every determined resolution.

When no unmerged path remains, continue under [Verification](#verification).
Otherwise leave the Git merge state unchanged, and report
`conflicted` for manual recovery.

## Verification

Run focused tests and applicable static checks for the pending integration.

When it fails, wait for the complete result and correct only failures determined
to have been caused by integrating `TARGET`. Check every correction against its
authoritative contracts, stage it, and repeat the applicable focused checks.
Repeat only after a correction changes repository state.

When no integration correction can be determined, retain the failure as the
verification outcome without changing unrelated code. Leave the pending merge
unchanged and report `verification-failed`; do not continue it.

After verification passes, run `sh "$runner" continue "$TARGET"` and report
`merged` when it succeeds.

## Report

Return the authoritative specification's [`Result`](../../../docs/specs/agents/skills/remdo-merge-main.md#result). When
addressing a human, render it under the shared [`Reports`](../../../docs/specs/agents/protocol.md#reports) contract.
