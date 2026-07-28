# remdo-merge-main

This capability merges `origin/main` into the current branch and verifies the
result. Requested local work may be preserved; unrelated branch convergence
and remote mutation are outside the capability.

## Target

The run fetches `origin/main`; its resolved commit remains the target through
every continuation.

The destination is any attached branch. The capability refuses a missing
target, unrelated histories, or an unrelated Git operation already in progress.

## Working state

By default, the capability requires a clean repository. When local work is
present, explicit preserve mode proceeds only when the fixed target merges
cleanly with `HEAD`. It saves staged, unstaged, and non-ignored untracked work,
including staged versus unstaged distinctions, before changing the branch.

Integration and verification finish against the clean committed state before
restoration begins. Saved work remains recoverable until restoration completes.

The capability resolves a restoration conflict only when the correct result can
be determined. Otherwise, restoration remains resumable and the saved work is
retained.

## Merge

- An up-to-date branch remains unchanged.
- A branch that can fast-forward does so.
- Every other branch receives a merge commit.

The capability resolves a merge conflict only when the correct result can be
determined from intended behavior and repository evidence. It preserves
determined resolutions and leaves the merge resumable when any conflict remains
uncertain.

## Verification

An up-to-date or fast-forward result requires no repository check. A merge
commit requires `pnpm run check:full`.

When verification fails, the capability commits every determined correction
caused by integrating the target, then runs complete verification again. An
unrelated failure or one without a determined integration correction remains in
the result without rolling back the merge.

## Authority

The skill declares the [autonomous
scope](../../../AGENTS.md#safety--process) for the branch update, merge and
correction commits, and determined conflict resolutions. Preserve mode also
covers saving and restoring local work.

## Result

The result is `up-to-date`, `fast-forwarded`, `merged`, `conflicted`,
`verification-failed`, `restore-conflicted`, `restore-uncertain`, or `stopped`.

It reports the destination branch, fixed target, incoming commit count, merge
form, conflict dispositions, committed corrections, verification outcome,
preservation outcome, and any condition needed to resume or unblock the run.
