#!/usr/bin/env sh
# Classify clean/ahead/behind/diverged vs origin/main, FF-only a merely stale
# branch, print the pinned base SHA.
# Usage: preflight-base.sh
#   Run on the branch a task will fork from (usually dev). Fetches, compares to
#   origin/main, and pins the fork base (remdo-feature-flow "Preflight").
#
# Classification and refusal only — the caller owns the "unrelated changes"
# judgment and any resolution. Prints, to stdout, key=value lines:
#   STATE=even | behind        (the two states it can leave proceedable)
#   BASE=<pinned-origin/main-sha>
# and, when it fast-forwarded a behind branch, FF=performed.
# Exits distinctly (non-zero + stderr) for the states a run must stop on:
#   ahead, diverged, and a dirty tree (a fast-forward must not advance a
#   checkout the run should have stopped on).
set -eu

fail() {
  echo "preflight-base: $1" >&2
  exit 1
}

git rev-parse --git-dir >/dev/null 2>&1 || fail "not a git repository"

# A fast-forward would silently advance a dirty checkout; refuse before fetch
# alters remote refs the caller may compare against. The caller decides whether
# the dirt is this flow's own spec edits or unrelated work — not this script.
if ! git diff --quiet 2>/dev/null \
  || ! git diff --cached --quiet 2>/dev/null \
  || [ -n "$(git ls-files --others --exclude-standard)" ]; then
  fail "working tree is dirty — resolve before pinning the base (refusing to fast-forward over local changes)"
fi

# Fetch is always allowed — it only updates remote-tracking refs.
git fetch --quiet

git rev-parse --verify --quiet origin/main >/dev/null \
  || fail "origin/main not found — cannot classify against it"

# `A..B` counts commits reachable from B but not A. So origin/main..HEAD is how
# far HEAD is *ahead* of origin/main, and HEAD..origin/main is how far it is
# *behind*.
commits_ahead=$(git rev-list --count origin/main..HEAD 2>/dev/null)
commits_behind=$(git rev-list --count HEAD..origin/main 2>/dev/null)

base=$(git rev-parse origin/main)

if [ "$commits_ahead" -gt 0 ] && [ "$commits_behind" -gt 0 ]; then
  fail "branch has diverged from origin/main ($commits_ahead ahead, $commits_behind behind) — cannot fast-forward; land or rebase it first"
fi

if [ "$commits_ahead" -gt 0 ]; then
  fail "branch is ahead of origin/main by $commits_ahead commit(s) — that work would not follow the fork; land it in origin/main first"
fi

if [ "$commits_behind" -gt 0 ]; then
  # Merely stale: fast-forward along existing history (no rewrite, no merge
  # commit, nothing lost) so the design base equals the fork base.
  git merge --ff-only --quiet origin/main \
    || fail "fast-forward to origin/main refused despite a behind-only branch — resolve manually"
  echo "STATE=behind"
  echo "BASE=$base"
  echo "FF=performed"
  exit 0
fi

# Even.
echo "STATE=even"
echo "BASE=$base"
