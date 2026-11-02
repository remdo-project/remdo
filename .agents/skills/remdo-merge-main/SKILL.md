---
name: remdo-merge-main
description: Merge the latest fetched origin/main into the current attached branch from a clean working tree, resolving determined conflicts and verifying the merge before committing it, without rebasing or remote mutation. Use when the user asks to merge, sync, or update the current RemDo branch from main.
---

# RemDo Merge Main

## Authority

Under [repository authority](../../../AGENTS.md#repository-authority),
invocation authorizes fast-forwarding the current branch or committing one
merge of the fetched target, and staging conflict resolutions and integration
fixes. Concurrent repository mutation is unsupported.

## Steps

1. **Check.** If `HEAD` is detached or
   `git status --porcelain --untracked-files=normal` reports anything, then
   return `stopped`.
2. **Fetch.** Run `git fetch --no-tags origin main`, pin the target with
   `T=$(git rev-parse FETCH_HEAD)`, and count incoming commits with
   `N=$(git rev-list --count HEAD.."$T")`. If the fetch or either command
   fails, then return `stopped`. If `N` is 0, then return `up-to-date`.
3. **Merge.** Run `git merge --no-commit --ff --no-squash "$T"`, overriding
   any configured squash or no-fast-forward default. If it fast-forwarded, then
   return `fast-forwarded`. If it failed without starting a merge, then return
   `stopped` with its output.
4. **Conflicts.** Resolve a conflict only when intended behavior and repository
   evidence determine the result: inspect both sides and their contracts, and
   stage each resolution. If a conflict remains, then leave the merge state
   unchanged and return `conflicted`.
5. **Verify.** Run the testing policy's
   [checks before each commit](../../../docs/dev/testing.md#verification-lifecycle) on
   the pending merge, selecting affected tests from its diff against `T`. Fix
   and stage failures the merge caused, then rerun the
   affected checks. If a failure has no determined integration fix, then leave
   the merge pending and return `verification-failed`.
6. **Commit.** If `git status --porcelain --untracked-files=normal` shows
   unstaged changes or untracked files, then return `stopped`. Otherwise
   commit the whole index, since a merge rejects path arguments, with hooks
   enabled; a hook failure is a verification failure. Pipe Git's default merge
   message plus one line per integration fix into `git commit`:

   ```sh
   { cat "$(git rev-parse --git-path MERGE_MSG)"; printf '%s\n' "$FIXES"; } \
     | git commit --cleanup=strip -F -
   ```

   Return `merged`.

## Report

Report under the shared [Reports](../../../docs/specs/agents/protocol.md#reports)
contract: the outcome, branch, pinned target, incoming commit count, resolved
and unresolved conflicts, integration fixes, and checks run.
