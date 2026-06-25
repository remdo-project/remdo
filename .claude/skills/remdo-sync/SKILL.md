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

## Preconditions (warn and stop)

- **Task branch only** — not `dev`/`main`.
- **Clean working tree** — merge needs it; commit or stash first.

## The flow

1. **Fetch.** `git fetch --prune` (always allowed — it only updates
   remote-tracking refs).
2. **Already current** — `origin/main` not ahead → no-op; report and stop.
3. **Check the gate** above. False → stop with the explanation. True → continue.
4. **Probe for conflicts without touching the tree** — `git merge-tree
   --write-tree --merge-base $(git merge-base HEAD origin/main) HEAD origin/main`.
5. **Merge.** `git merge origin/main`.
6. **Resolve carefully** (if conflicts). Resolve only conflicts you can
   **determine are safe** — take the time to be sure: read both sides' intent, the
   surrounding code, `git log`/`git blame`, related changes. When a resolution is
   not clearly correct, **do not guess** — leave it conflicted and **call it
   out** with file/region and what is unclear. Do not finish a half-resolved merge
   silently. Bias to callout when unsure.
7. **Re-anchor `wip-base`** to the merged-in `origin/main`:

   ```sh
   git tag -f wip-base "$(git merge-base origin/main HEAD)"
   ```

   The pulled-in commits now fall *inside* the base and drop out of
   `wip-base..HEAD`, restoring the invariant. Moving the tag needs the user's
   confirmation (`remdo-feature-flow` "Branch base").

## Permissions

Invoking this skill authorizes, on the current **task branch**: `git fetch`
(always), `git merge origin/main`, conflict-resolution edits, the merge commit,
and moving the `wip-base` tag. It **never** rebases, force-pushes, or pushes;
never touches `dev`/`main`; and pull (which mutates your branch outside this
flow) stays the user's.

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
