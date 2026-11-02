---
name: remdo-merge-main
description: Merge the latest fetched origin/main into the current attached branch from a clean working tree, resolving determined conflicts and verifying the merge before committing it, without rebasing or remote mutation. Use when the user asks to merge, sync, or update the current RemDo branch from main.
---

# RemDo Merge Main

## Authority

Under [repository authority](../../../AGENTS.md#repository-authority),
invocation authorizes updating `origin/main`, fast-forwarding the current
branch or committing one merge of the fetched target, and staging conflict
resolutions and integration fixes. Rebasing, remote mutation, and concurrent
repository mutation are outside the skill.

## Steps

1. **Check.** If `HEAD` is detached or `git status --porcelain` reports
   anything, then return `stopped`.
2. **Fetch.** Run `git fetch origin main` and pin the target with
   `T=$(git rev-parse origin/main)`. If `T` is an ancestor of `HEAD`, then
   return `up-to-date`.
3. **Merge.** Run `git merge --no-commit "$T"`. If it fast-forwarded, then
   return `fast-forwarded`. If it failed without starting a merge, then return
   `stopped` with its output.
4. **Conflicts.** Resolve a conflict only when intended behavior and repository
   evidence determine the result: inspect both sides and their contracts, and
   stage each resolution. If a conflict remains, then leave the merge state
   unchanged and return `conflicted`.
5. **Verify.** Run the testing policy's
   [pre-commit checks](../../../docs/dev/testing.md#verification-lifecycle) on
   the pending merge. Fix and stage failures the merge caused, then rerun the
   affected checks. If a failure has no determined integration fix, then leave
   the merge pending and return `verification-failed`.
6. **Commit.** If unstaged changes or untracked files remain, then return
   `stopped`. Otherwise commit with Git's default merge message, appending one
   line per integration fix, and with hooks enabled; a hook failure is a
   verification failure. Return `merged`.

## Report

Report under the shared [Reports](../../../docs/specs/agents/protocol.md#reports)
contract: the outcome, branch, pinned target, incoming commit count, resolved
and unresolved conflicts, integration fixes, and checks run.
