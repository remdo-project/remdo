---
name: remdo-sync
description: Use to bring the latest `origin/main` into the current task branch and keep `wip-base` correct. Merges (never rebases, never force-pushes), resolves only conflicts it can determine are safe, calls out the rest, and moves `wip-base` to the new fork point so later refine/review diffs show only the branch's own work. Triggers include "sync from main", "update this branch", "pull in main".
---

# Sync

## Overview

Bring the current task branch up to date with `origin/main` and **re-anchor
`wip-base`** so `wip-base..HEAD` keeps meaning "this branch's own work" — the
merged-in `origin/main` commits drop out of the diff. `remdo-feature-flow` sets
the *first* anchor when it creates the branch; this skill owns every re-anchor
after that, so review consumers can always trust `wip-base..HEAD` without
computing a base themselves.

Per the **Skill authoring** rule in `AGENTS.md`, this skill encodes *intent* —
stay current, never rewrite shared history, keep the base honest — and leaves
judgement (notably conflict resolution) to the run rather than baking in rigid
rules a more capable future run would do better.

## Strategy: always merge

Integrate `origin/main` with **`git merge`**, never rebase. Merge never rewrites
history, so it never needs a force-push and never scrambles an open PR's review —
the right default for an autonomous skill. A user who wants a linear history can
rebase by hand; this skill does not, and **never pushes**. (See `References` for
the rebase-vs-merge tradeoff.)

## The invariant and the gate

The job is to keep one invariant true: **`wip-base..HEAD` is exactly the current
branch's own work — nothing pulled in.** Sync proceeds only when it can preserve
that; otherwise it **hard-blocks** rather than producing a confusing diff.

The single gate (parent-free, no branch-name tracking):

```sh
git merge-base --is-ancestor wip-base origin/main
```

True means everything the branch was based on is already in `origin/main`, so
merging `origin/main` and re-anchoring to it leaves only the branch's own work.
False means the branch's base is **not yet in `origin/main`** — e.g. it forked
from another in-progress branch that has not merged. Then **stop**: explain that
sync would pull in commits that are not this branch's work, and that it will be
possible once the base lands in `origin/main`. Do not try to sync from the parent
instead — that is the complexity this gate deliberately avoids.

The gate assumes the parent merges with **preserved commit identity** (a merge
commit, this repo's PR mode). If a parent is **squash-merged**, its commits get a
new identity and never become ancestors, so the gate stays blocked permanently —
re-fork from current `origin/main` rather than waiting on sync.

## Preconditions (warn and stop)

- **Task branch only** — not `dev`/`main`.
- **Clean working tree** — merge needs it; commit or stash first.

## The flow

1. **Fetch.** `git fetch --prune` (always allowed — it only updates
   remote-tracking refs).
2. **Check the gate** above — always, before any merge or re-anchor. False → stop
   with the explanation. True → continue.
3. **Already up to date?** If `origin/main` is already reachable from `HEAD`
   (nothing to merge — e.g. a prior manual merge, or a sync interrupted before the
   re-anchor), skip the merge and go straight to step 6 to fix the tag.
4. **Probe for conflicts without touching the tree** — `git merge-tree
   --write-tree --merge-base $(git merge-base HEAD origin/main) HEAD origin/main`.
5. **Merge** (and resolve, if conflicts). `git merge origin/main`. Resolve only
   conflicts you can **determine are safe** — take the time to be sure: read both
   sides' intent, the surrounding code, `git log`/`git blame`, related changes.
   When a resolution is not clearly correct, **do not guess** — leave it
   conflicted and **call it out** with file/region and what is unclear. Do not
   finish a half-resolved merge silently. Bias to callout when unsure.

   **Commit the merge before continuing.** On a conflicted merge, `HEAD` stays at
   the pre-merge commit until you `git merge --continue` (or `git commit`), so the
   merge commit must exist before step 6 — otherwise `merge-base` in step 6 reads
   the old `HEAD` and re-anchors `wip-base` to the wrong base. If conflicts can't
   be safely resolved, stop with the callout and **do not** re-anchor.
6. **Re-anchor `wip-base`** to the now-reachable `origin/main` (only once the merge
   commit exists — `HEAD` is the merge):

   ```sh
   git tag -f wip-base "$(git merge-base origin/main HEAD)"
   ```

   The pulled-in (or already-present) commits fall *inside* the base and drop out
   of `wip-base..HEAD`, restoring the invariant. A no-op if the tag was already
   current. Moving the tag here is part of the sync the user invoked — no separate
   confirmation (see Permissions).

## Permissions

Invoking this skill is an explicitly declared autonomous scope (per AGENTS.md):
it authorizes, on the current **task branch**, `git fetch` (always),
`git merge origin/main`, conflict-resolution edits, the merge commit, and moving
the `wip-base` tag. It **never** rebases, force-pushes, or pushes; and pull
(which mutates your branch outside this flow) stays the user's.

## Final report

Index the result: commits pulled in from `origin/main` (count, not a re-narration);
whether the merge was clean or had conflicts; conflicts auto-resolved (with a
one-line why-safe each) and conflicts left for the user (with file/region and what
is unclear); and the new `wip-base` target.

## References

- Rebase-vs-merge / force-push tradeoff:
  <https://www.atlassian.com/git/tutorials/merging-vs-rebasing>.
- Conflict-probe primitive (`git merge-tree --write-tree`): the local
  `syncbranch` helper uses the same check.
- Branch base (`wip-base`), its movement rule, and the calling flow:
  `remdo-feature-flow` skill.
- Skill-authoring rule and fetch/push policy: `AGENTS.md`.
