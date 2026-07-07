#!/usr/bin/env sh
# Fetch; report up-to-date / merge-needed / dirty-tree.
# Usage: sync-probe.sh
#   Run on the branch to be synced. Fetches, then classifies whether
#   origin/main still needs merging (the probe preceding remdo-sync's merge).
#
# Classification only — it never merges or resolves conflicts. Prints, to
# stdout, one key=value line:
#   STATE=dirty-tree   merge's clean-tree precondition fails (commit/stash first)
#   STATE=up-to-date   origin/main already reachable from HEAD (nothing to merge)
#   STATE=merge-needed origin/main has commits to integrate
# A dirty tree is reported (STATE=dirty-tree, exit 0), not an error: it is a
# precondition the caller acts on, not a malformed invocation. Only genuine
# failures (not a repo, missing origin/main) exit non-zero.
set -eu

fail() {
  echo "sync-probe: $1" >&2
  exit 1
}

git rev-parse --git-dir >/dev/null 2>&1 || fail "not a git repository"

# Fetch is always allowed — it only updates remote-tracking refs.
git fetch --prune --quiet

git rev-parse --verify --quiet origin/main >/dev/null \
  || fail "origin/main not found — nothing to sync from"

# Dirty tree is a merge precondition (remdo-sync): report it before the
# reachability check so the caller stops on it regardless of merge state.
if ! git diff --quiet 2>/dev/null \
  || ! git diff --cached --quiet 2>/dev/null \
  || [ -n "$(git ls-files --others --exclude-standard)" ]; then
  echo "STATE=dirty-tree"
  exit 0
fi

# Up to date when origin/main is already an ancestor of HEAD (e.g. a prior
# manual merge) — merge-base equals origin/main's tip.
if git merge-base --is-ancestor origin/main HEAD; then
  echo "STATE=up-to-date"
else
  echo "STATE=merge-needed"
fi
