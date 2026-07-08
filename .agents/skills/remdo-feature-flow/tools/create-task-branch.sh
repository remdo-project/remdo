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
# unresolvable base, a moved base carrying edits (risks a conflicted switch),
# the underlying switch failing (e.g. drift that would abort and strand the
# spec), and a switch that exits 0 but left conflict markers merging the spec
# onto the new base. Staged vs unstaged is not distinguished — the index is the
# user's private bookkeeping (AGENTS.md); `--merge` carries both cleanly at an
# unchanged base, and any real conflict is caught by the post-switch check.
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

# With HEAD at the pinned base (the feature-flow precondition), --merge carries
# the spec edits (staged or unstaged) cleanly. Carrying edits across a *moved*
# base can conflict, and a conflicted switch would strand the tree with the
# branch already created — so refuse upfront when HEAD has drifted from the base
# and the tree has any edits (index or worktree). The index is not treated
# specially (AGENTS.md): staged and unstaged both count as tree edits here.
if [ "$(git rev-parse HEAD)" != "$(git rev-parse "$base^{commit}")" ] \
  && ! { git diff --quiet 2>/dev/null && git diff --cached --quiet 2>/dev/null; }; then
  fail "HEAD is not at the pinned base and the tree has edits — carrying them across a moved base risks a conflicted switch; reconcile HEAD with the base first"
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
