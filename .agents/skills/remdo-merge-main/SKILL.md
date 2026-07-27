---
name: remdo-merge-main
description: Merge the latest fetched origin/main into the current attached branch without rebasing or remote mutation, optionally preserving local work, resolving determined conflicts, and verifying non-fast-forward integration. Use when the user asks to merge, sync, or update the current RemDo branch from main.
---

# RemDo Merge Main

Implement the authoritative
[`remdo-merge-main`](../../../docs/spec/skills/remdo-merge-main.md) contract.

## Run state

Set `runner` to
`.agents/skills/remdo-merge-main/tools/merge-main.sh`. Run
`sh "$runner" status` before other repository work.

- On `STATE=idle`, run `sh "$runner" start`. Add `--preserve` only when the
  user explicitly asks to preserve local work.
- On `STATE=preservation-needed` or `STATE=integration-ready`, run
  `sh "$runner" continue`.
- On `STATE=conflicted` or `STATE=merge-ready`, continue under
  [Conflict resolution](#conflict-resolution).
- On `STATE=verification-needed`, continue under [Verification](#verification).
- On `STATE=finish-needed`, run `sh "$runner" finish`.
- On `STATE=restore-pending`, run `sh "$runner" continue`.
- On `STATE=restore-ready`, run `sh "$runner" complete-restore`.
- On `STATE=restore-conflicted`, continue under
  [Restoration](#restoration).
- On any other unfinished or invalid state, report the runner output and stop.

Trust the runner's fixed target, merge form, incoming count, preservation
identity, and state transitions. Do not reproduce its Git plumbing manually.
An `up-to-date` or `fast-forwarded` result is complete.

## Conflict resolution

Resolve a merge conflict only when intended behavior and repository evidence
determine the result. Inspect both sides, relevant contracts, and history.
Stage only determined resolutions, then run `sh "$runner" continue`. Leave an
uncertain conflict resumable and report what remains uncertain.

## Verification

Run `pnpm run check:full` for `STATE=verification-needed`.

When it passes, run `sh "$runner" finish`. When it fails, wait for the complete
result and correct only failures determined to have been caused by integrating
the fixed target. Check each correction against its authoritative contracts,
commit one coherent correction batch, and run `pnpm run check:full` again.
Repeat only after a correction changes repository state.

When no integration correction can be determined, retain the failure as the
verification result and run `sh "$runner" finish --verification-failed`
without changing unrelated code.

## Restoration

The runner restores preserved work only after integration verification
finishes. On `STATE=restore-conflicted`, use the reported saved-work commit to
resolve only what repository evidence determines, including its staged versus
unstaged intent. Then run `sh "$runner" complete-restore`.

The runner retains saved work after a manually resolved restoration conflict.
Leave an uncertain conflict resumable; do not drop or replace the saved work.

## Authority

Invocation declares an autonomous scope on the current branch for the runner's
branch update, the merge and determined correction commits, determined conflict
resolutions, and explicitly requested preservation and restoration. It does not
authorize pull, rebase, push, force-push, or other remote mutation.

## Report

Return the contract's [Result](../../../docs/spec/skills/remdo-merge-main.md#result).
