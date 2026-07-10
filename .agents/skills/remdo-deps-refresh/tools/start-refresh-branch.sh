#!/usr/bin/env sh
# Start a dependency-refresh run on a fresh topic branch from origin/main.
# Refuse dirty trees so the switch cannot carry unrelated work into the run.
set -eu

fail() {
  echo "start-refresh-branch: $1" >&2
  exit 1
}

git rev-parse --git-dir >/dev/null 2>&1 || fail "not a git repository"
skill_dir="$(CDPATH='' cd -- "$(dirname -- "$0")/.." && pwd)"

if [ -n "$(git status --porcelain)" ]; then
  fail "working tree is dirty — resolve it before starting a dependency refresh"
fi

git fetch --quiet origin
base=$(git rev-parse --verify --quiet origin/main) \
  || fail "origin/main not found after fetch"

stem="chore/deps-refresh-$(date +%Y-%m-%d)"
name="$stem"
suffix=2
while git show-ref --verify --quiet "refs/heads/$name" \
  || git show-ref --verify --quiet "refs/remotes/origin/$name"; do
  name="$stem-$suffix"
  suffix=$((suffix + 1))
done

exec sh "$skill_dir/../_shared/tools/create-branch-from-base.sh" \
  "$name" "$base"
