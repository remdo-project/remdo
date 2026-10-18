# remdo-merge-main

This capability merges `origin/main` into the current branch, verifies the
change, and returns an [agent result](../protocol.md#results). Unrelated branch
convergence and remote mutation are outside the capability. Concurrent
repository mutation and recovery from an interrupted run are also outside the
capability.

## Authority

[Repository authority](../../../../AGENTS.md#repository-authority): invocation
authorizes updating the local `origin/main` tracking ref to the fetched target,
fast-forwarding or preparing and committing one merge of that target, staging
determined conflict resolutions and integration corrections.

## Target

The run fetches remote `main` from `origin` and fixes the fetched commit as its
target. Later remote changes do not change that target.

The destination is any attached branch. The capability refuses a missing
target, unrelated histories, or an unrelated Git operation already in progress.

## Working state

The capability starts only with a clean index and working tree, including no
non-ignored untracked files. It refuses dirty work before fetching or changing
the branch.

## Merge

- An up-to-date branch remains unchanged.
- A branch that can fast-forward does so.
- Every other branch receives a merge commit.

The capability resolves a merge conflict only when the correct result can be
determined from intended behavior and repository evidence. Otherwise, it leaves
the Git merge state for manual recovery.

## Verification

An up-to-date or fast-forward result requires no repository check. Before a
merge commit, the capability runs focused tests and applicable static checks for
the pending integration.

When verification fails, the capability includes every determined integration
correction in the pending merge and repeats the applicable checks. An unrelated
failure or one without a determined integration correction leaves the pending
merge unchanged and produces `verification-failed`.

## Result

The result uses the shared [result fields](../protocol.md#results):

```yaml
outcome: <up-to-date | fast-forwarded | merged | conflicted | verification-failed | stopped>
reason: <stop or manual recovery condition> # if any
concerns: <Concern[]> # if any
destination: <branch> # if resolved
target: <fixed fetched origin/main commit> # if fetched
incoming_commits: <count> # if target resolved
merge_form: <up-to-date | fast-forward | merge-commit> # if determined
conflicts: # if any
  - path: <conflicted path>
    status: <resolved | unresolved>
corrections: # if any
  - summary: <integration correction>
verification: <not-run | passed | failed> # if merge form determined
```

`stopped` means an otherwise-unclassified failure ended the run.
