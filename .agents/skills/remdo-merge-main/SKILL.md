---
name: remdo-merge-main
description: Merge the latest fetched origin/main into the current attached branch without rebasing or remote mutation, optionally preserving local work, resolving determined conflicts, and verifying non-fast-forward integration. Use when the user asks to merge, sync, or update the current RemDo branch from main.
---

# RemDo Merge Main

Implement the authoritative
[`remdo-merge-main`](../../../docs/spec/skills/remdo-merge-main.md) contract.
Invocation declares the autonomous scope in [Authority](#authority).

## Start

Set `runner` to
`.agents/skills/remdo-merge-main/tools/merge-main.sh`. Run
`sh "$runner" start`. Add `--preserve` only when the user explicitly asks to
preserve local work.

Retain `TARGET` and `STASH` from the runner output for this run:

- `up-to-date` and `fast-forwarded` are complete.
- `conflicted` and `merge-ready` continue under [Merge conflicts](#merge-conflicts).
- `verification-needed` continues under [Verification](#verification).
- `restore-conflicted` continues under [Restoration](#restoration).
- Any failure is terminal. Report its output and any retained stash.

Concurrent repository mutation and recovery after an unexpected interruption
are unsupported. Do not construct a parallel run journal or infer a resumable
skill phase.

## Merge conflicts

Resolve a merge conflict only when intended behavior and repository evidence
determine the result. Inspect both sides and their authoritative contracts.
Stage every determined resolution.

When no unmerged path remains, run
`sh "$runner" continue "$TARGET"` and continue under [Verification](#verification).
Otherwise leave the Git merge state and retained stash unchanged, and report
`conflicted` for manual recovery.

## Verification

Run `pnpm run check:full`.

When it fails, wait for the complete result and correct only failures determined
to have been caused by integrating `TARGET`. Check every correction against its
authoritative contracts, commit one coherent correction batch, and run the full
check again. Repeat only after a correction changes repository state.

When no integration correction can be determined, retain the failure as the
verification outcome without changing unrelated code.

After verification, continue under [Restoration](#restoration) when `STASH` was
reported. Otherwise report `merged` or `verification-failed`.

## Restoration

When `restore-conflicted` came from `start`, continue with the existing
conflict. Otherwise run `sh "$runner" restore "$STASH"`.

When it reports `restore-conflicted`, resolve only what intended behavior and
repository evidence determine, including the saved index versus working-tree
intent. Inspect the saved index tree at `STASH^2`, the saved working tree at
`STASH`, and any saved untracked tree at `STASH^3`; absence of an unmerged path
does not prove that saved work was applied. Stage or unstage every determined
result accordingly.

Only after all saved paths and their index intent are accounted for, run
`sh "$runner" complete-restore "$STASH" --resolved`.

If restoration remains uncertain, leave both the conflict and stash unchanged
and report `restore-conflicted` for manual recovery. Otherwise report the
integration and verification outcome retained before restoration.

## Authority

Invocation declares an autonomous scope on the current branch for the runner's
branch update, the merge and determined correction commits, determined conflict
resolutions, and explicitly requested preservation and restoration. It does not
authorize pull, rebase, push, force-push, or other remote mutation.

## Report

Return the contract's
[`Result`](../../../docs/spec/skills/remdo-merge-main.md#result).
