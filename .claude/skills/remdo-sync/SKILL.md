---
name: remdo-sync
description: Use to bring the latest `origin/main` into the current branch. Merges (never rebases, never force-pushes), resolves only conflicts it can determine are safe, and calls out the rest. Triggers include "sync from main", "update this branch", "pull in main".
---

# Sync

## Overview

Bring the current branch up to date with `origin/main`. Review diffs use the
`origin/main` merge-base (see `remdo-feature-flow` "Branch base"), which needs no
base tag to stay correct across a merge — so this skill owns no bookkeeping: it
does one thing, integrate `origin/main` cleanly.

Per the **Skill authoring** rule in `AGENTS.md`, this skill encodes *intent* —
stay current, never rewrite shared history — and leaves judgement (notably
conflict resolution) to the run rather than baking in rigid rules a more capable
future run would do better.

## Strategy: merge, never rebase

Integrate `origin/main` with a plain **`git merge origin/main`**, never rebase
(it fast-forwards or makes a merge commit as needed). Merge never rewrites
history, so it never needs a force-push and never scrambles an open PR's review —
the right default for an autonomous skill. A user who wants a linear history can
rebase by hand; this skill does not, and **never pushes**. (See `References` for
the rebase-vs-merge tradeoff.)

## Preconditions (warn and stop)

- **Clean working tree** — merge needs it; commit or stash first.

Sync runs on whatever branch is checked out (no branch-name gate).

## The flow

1. **Fetch.** `git fetch --prune` (always allowed — it only updates
   remote-tracking refs).
2. **Already up to date?** If `origin/main` is already reachable from `HEAD`
   (nothing to merge — e.g. a prior manual merge), finish here.
3. **Merge** (and resolve, if conflicts). `git merge origin/main`. Resolve only
   conflicts you can **determine are safe** — take the time to be sure: read both
   sides' intent, the surrounding code, `git log`/`git blame`, related changes.
   When a resolution is not clearly correct, **do not guess** — leave it
   conflicted and **call it out** with file/region and what is unclear. Do not
   finish a half-resolved merge silently. Bias to callout when unsure. If
   conflicts can't be safely resolved, stop with the callout rather than
   committing a half-resolved merge.
4. **Verify.** Unless the merge fast-forwarded, run `pnpm run check:full` (the
   merge is already committed, so the changed-only `check` would select no
   tests): a textually clean merge can still be semantically broken, and
   auto-resolved conflicts double the reason. A failure is part of the callout
   — never finish a red sync silently.

## Permissions

Invoking this skill is an explicitly declared autonomous scope (per AGENTS.md):
it authorizes, on the current branch, `git fetch` (always),
`git merge origin/main`, conflict-resolution edits, and the merge commit. It
**never** rebases, force-pushes, or pushes; and pull (which mutates your branch
outside this flow) stays the user's.

## Final report

Index the result: commits pulled in from `origin/main` (count, not a
re-narration); whether the merge was clean or had conflicts; conflicts
auto-resolved (with a one-line why-safe each) and conflicts left for the user
(with file/region and what is unclear); the check script's result (or that it
was skipped for a fast-forward).

## References

- Rebase-vs-merge / force-push tradeoff:
  <https://www.atlassian.com/git/tutorials/merging-vs-rebasing>.
- Branch base (`origin/main...HEAD`) and the calling flow: `remdo-feature-flow`
  skill.
- Skill-authoring rule and fetch/push policy: `AGENTS.md`.
