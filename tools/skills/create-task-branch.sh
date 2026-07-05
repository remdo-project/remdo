#!/usr/bin/env sh
# Create the confirmed branch from the pinned base carrying uncommitted spec
# edits; refuse unsafe states.
# Usage: create-task-branch.sh <branch-name> <pinned-base-sha>
#   <branch-name>     the confirmed task-branch name (caller confirms prefix)
#   <pinned-base-sha> the base pinned at preflight (remdo-feature-flow)
#
# Runs `git switch --merge -c <name> --no-track <sha>`: --merge carries the
# uncommitted spec edits onto the new base; --no-track forks from a raw SHA
# without setting an upstream. Refusal only — the caller resolves any drift.
# Refuses (non-zero + stderr): missing args, a name already taken, an
# unresolvable base, staged edits (--merge strands them), the underlying switch
# failing (e.g. drift that would abort and strand the spec), and a switch that
# exits 0 but left conflict markers merging the spec onto the new base.
set -eu

fail() {
  echo "create-task-branch: $1" >&2
  exit 1
}

git rev-parse --git-dir >/dev/null 2>&1 || fail "not a git repository"

name=${1-}
base=${2-}
[ -n "$name" ] || fail "missing branch name (usage: create-task-branch.sh <name> <sha>)"
[ -n "$base" ] || fail "missing pinned base SHA (usage: create-task-branch.sh <name> <sha>)"

git rev-parse --verify --quiet "$base^{commit}" >/dev/null \
  || fail "pinned base '$base' does not resolve to a commit"

if git show-ref --verify --quiet "refs/heads/$name"; then
  fail "branch '$name' already exists"
fi

# --merge refuses to carry *staged* edits across the base change; feature-flow's
# contract is to clear that drift rather than un-stage, so refuse loudly here
# instead of letting the switch produce a confusing error.
if ! git diff --cached --quiet 2>/dev/null; then
  fail "staged edits present — 'git switch --merge' cannot carry them; clear the staged drift (restore or discard) — do not unstage or commit it"
fi

# The switch itself is a guard: with base drift a plain -c would abort and strand
# the spec; --merge carries clean spec edits but attempts a three-way merge on
# conflicting ones. `git switch --merge` exits 0 even when that merge leaves
# conflict markers, so its exit status is not enough — check for unmerged index
# entries afterwards and refuse loudly, before the caller mistakes a
# conflict-marked tree for a clean fork.
git switch --merge -c "$name" --no-track "$base" \
  || fail "git switch --merge failed — the tree would strand the spec edits; resolve drift and retry"

if [ -n "$(git ls-files -u)" ]; then
  fail "git switch --merge left conflicts merging the spec edits onto '$base'; resolve drift and retry"
fi

echo "BRANCH=$name"
echo "BASE=$(git rev-parse "$base")"
