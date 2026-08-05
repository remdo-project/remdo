# remdo-merge-main

This capability merges `origin/main` into the current branch, verifies the
change, and returns an [agent result](../results.md#results). Requested local
work may be preserved; unrelated branch convergence and remote mutation are
outside the capability. Concurrent repository mutation and recovery from an
interrupted run are also outside the capability.

## Authority

The skill declares the [autonomous
scope](../../../../AGENTS.md#safety--process) for the branch update, merge and
correction commits, and determined conflict resolutions. Preserve mode also
covers saving and restoring local work.

## Target

The run fetches remote `main` from `origin` and fixes the fetched commit as its
target. Later remote changes do not change that target.

The destination is any attached branch. The capability refuses a missing
target, unrelated histories, or an unrelated Git operation already in progress.

## Working state

By default, the capability requires a clean repository. Explicit preserve mode
saves staged, unstaged, and non-ignored untracked work, including staged versus
unstaged distinctions, before changing the branch.

Integration and verification finish against the clean committed state before
restoration begins. The capability then reapplies the saved work and discards
its saved copy only after restoration succeeds.

The capability resolves a restoration conflict only when the correct result can
be determined. Otherwise, it leaves the conflict and saved work for manual
recovery.

## Merge

- An up-to-date branch remains unchanged.
- A branch that can fast-forward does so.
- Every other branch receives a merge commit.

The capability resolves a merge conflict only when the correct result can be
determined from intended behavior and repository evidence. Otherwise, it leaves
the Git merge state for manual recovery.

## Verification

An up-to-date or fast-forward result requires no repository check. A merge
commit requires the [full repository check](../../../../AGENTS.md#checks).

When verification fails, the capability commits every determined correction
caused by integrating the target, then runs complete verification again. An
unrelated failure or one without a determined integration correction remains in
the result without rolling back the merge.

## Result

The result uses this shape:

```yaml
outcome: <up-to-date | fast-forwarded | merged | conflicted | verification-failed | restore-conflicted>
destination: <branch>
target: <fixed fetched origin/main commit>
incoming_commits: <count>
merge_form: <up-to-date | fast-forward | merge-commit>
conflicts: # if any
  - path: <conflicted path>
    status: <resolved | unresolved>
corrections: # if any
  - summary: <committed integration correction>
verification: <not-run | passed | failed>
preservation: <not-needed | pending | restored | restore-conflicted> # if requested
reason: <manual recovery condition> # if any
```

`not-needed` means preserve mode found no local work. `pending` means saved work
awaits integration recovery before it can be restored.
