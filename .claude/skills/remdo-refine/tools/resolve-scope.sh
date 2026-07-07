#!/usr/bin/env sh
# Resolve explicit range / task-branch default / working-tree to an immutable
# base SHA + file list; refuse mixed scopes.
# Usage: resolve-scope.sh [<range> | working-tree]
#   no arg        infer: task-branch default origin/main...HEAD (committed range);
#                 refuses a detached HEAD (no branch identity for the default)
#   <range>       an explicit committed range: A..B or A...B. Both endpoints must
#                 resolve to a commit and the tip B must be HEAD (the review loop
#                 walks base..HEAD); empty endpoints default to HEAD.
#   working-tree  the uncommitted changes (staged + unstaged + untracked)
#
# Classification and refusal only — no resolution or review judgment. Prints, to
# stdout, key=value lines a caller parses:
#   SCOPE=committed-range | working-tree
#   BASE=<immutable-sha>  | WORKING_TREE
#   then a FILES section: a line "FILES", then one path per line (may be empty).
# Fails loud (non-zero + stderr) on every refused state; makes no commits, never
# writes the tree.
set -eu

fail() {
  echo "resolve-scope: $1" >&2
  exit 1
}

git rev-parse --git-dir >/dev/null 2>&1 || fail "not a git repository"

scope_arg=${1-}

# A committed range must run against a clean tree: staged/unstaged/untracked
# changes sit outside the resolved range and would be silently unreviewed
# (remdo-refine "Scope"). This is the mixed-scope refusal — a committed range
# requested while uncommitted work is present.
tree_is_dirty() {
  ! git diff --quiet 2>/dev/null \
    || ! git diff --cached --quiet 2>/dev/null \
    || [ -n "$(git ls-files --others --exclude-standard)" ]
}

emit_files_committed() {
  # Files changed in the range, three-dot semantics already baked into $base.
  echo "FILES"
  git diff --name-only "$1..HEAD"
}

emit_files_working_tree() {
  echo "FILES"
  # Tracked changes (staged + unstaged) plus untracked-not-ignored, deduped.
  {
    git diff --name-only HEAD
    git ls-files --others --exclude-standard
  } | sort -u
}

resolve_working_tree() {
  if ! tree_is_dirty; then
    fail "working-tree scope requested but the tree is clean — nothing to resolve"
  fi
  echo "SCOPE=working-tree"
  echo "BASE=WORKING_TREE"
  emit_files_working_tree
}

resolve_committed_range() {
  # $1 is the range's base ref (already extracted). Anchor it to an immutable
  # SHA so a caller looping past it cannot let the base move.
  base=$(git rev-parse --verify --quiet "$1^{commit}") \
    || fail "cannot resolve range base '$1' to a commit"
  if tree_is_dirty; then
    fail "committed-range scope but the working tree is dirty — commit or stash first (mixed scope refused)"
  fi
  echo "SCOPE=committed-range"
  echo "BASE=$base"
  emit_files_committed "$base"
}

case "$scope_arg" in
  working-tree)
    resolve_working_tree
    ;;
  '')
    # Infer: the task-branch default is origin/main...HEAD (the three-dot
    # merge-base range = this branch's own work). Refuse on an integration
    # branch where that default is meaningless (remdo-refine case 3): main/dev,
    # or no merge-base with origin/main at all.
    branch=$(git rev-parse --abbrev-ref HEAD)
    # A detached HEAD has no branch identity, so the origin/main...HEAD default
    # ("this branch's own work") is meaningless — refuse and demand a range.
    if [ "$branch" = HEAD ]; then
      fail "detached HEAD — no branch for the origin/main...HEAD default; pass an explicit range"
    fi
    case "$branch" in
      main | dev)
        fail "on integration branch '$branch' — refusing the origin/main...HEAD default; pass an explicit range"
        ;;
    esac
    git rev-parse --verify --quiet origin/main >/dev/null \
      || fail "origin/main not found — cannot compute the task-branch default; pass an explicit range"
    merge_base=$(git merge-base origin/main HEAD 2>/dev/null) \
      || fail "no merge-base with origin/main — cannot compute the task-branch default; pass an explicit range"
    resolve_committed_range "$merge_base"
    ;;
  *..*)
    # Explicit range A..B or A...B. The caller's review loop always runs
    # base..HEAD, so B must resolve to HEAD — a range ending anywhere else would
    # silently review a different tip than the loop walks. Validate BOTH
    # endpoints resolve, refuse B != HEAD, then extract A (three-dot as a
    # merge-base request).
    case "$scope_arg" in
      *...*)
        left=${scope_arg%%...*}
        right=${scope_arg##*...}
        ;;
      *)
        left=${scope_arg%%..*}
        right=${scope_arg##*..}
        ;;
    esac
    left=${left:-HEAD}
    right=${right:-HEAD}

    left_sha=$(git rev-parse --verify --quiet "$left^{commit}") \
      || fail "range base '$left' does not resolve to a commit"
    right_sha=$(git rev-parse --verify --quiet "$right^{commit}") \
      || fail "range tip '$right' does not resolve to a commit"
    head_sha=$(git rev-parse --verify HEAD)
    [ "$right_sha" = "$head_sha" ] \
      || fail "range tip '$right' is not HEAD — the review loop walks base..HEAD, so the tip must be HEAD"

    case "$scope_arg" in
      *...*)
        base_ref=$(git merge-base "$left" "$right" 2>/dev/null) \
          || fail "cannot compute merge-base for range '$scope_arg'"
        ;;
      *)
        base_ref=$left
        ;;
    esac
    resolve_committed_range "$base_ref"
    ;;
  *)
    fail "unrecognized scope '$scope_arg' — expected a range (A..B / A...B) or 'working-tree'"
    ;;
esac
