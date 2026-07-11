#!/usr/bin/env sh
# Create an untracked topic branch from a pinned base, carrying working-tree
# edits only when doing so cannot cross a moved base.
# Usage: create-branch-from-base.sh <branch-name> <pinned-base-sha>
set -eu

fail() {
  echo "create-branch-from-base: $1" >&2
  exit 1
}

git rev-parse --git-dir >/dev/null 2>&1 || fail "not a git repository"

name=${1-}
base=${2-}
[ -n "$name" ] || fail "missing branch name (usage: create-branch-from-base.sh <name> <sha>)"
[ -n "$base" ] || fail "missing pinned base SHA (usage: create-branch-from-base.sh <name> <sha>)"

base_ref=$base
base=$(git rev-parse --verify --quiet "$base_ref^{commit}") \
  || fail "pinned base '$base_ref' does not resolve to a commit"

if git show-ref --verify --quiet "refs/heads/$name"; then
  fail "branch '$name' already exists"
fi

# Creating at the current base leaves edits in place. Across a moved base, those
# edits could be carried or conflict, so refuse that state before switching.
if [ "$(git rev-parse HEAD)" != "$base" ] \
  && [ -n "$(git status --porcelain)" ]; then
  fail "HEAD is not at the pinned base and the tree has edits — carrying them across a moved base risks a conflicted switch; reconcile HEAD with the base first"
fi

git switch -c "$name" --no-track "$base" \
  || fail "git switch failed — reconcile branch or base drift and retry"

echo "BRANCH=$name"
echo "BASE=$base"
