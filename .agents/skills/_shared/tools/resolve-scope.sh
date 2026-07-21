#!/usr/bin/env sh
# Resolve explicit range / task-branch default / working-tree to immutable
# comparison SHAs + a file list; refuse mixed scopes.
# Usage: resolve-scope.sh [<range> | working-tree]
#   no arg        infer: task-branch default origin/main...HEAD (committed range);
#                 refuses a detached HEAD (no branch identity for the default)
#   <range>       an explicit committed range: A..B or A...B. Both endpoints are
#                 required and must resolve to commits; B must resolve to HEAD,
#                 and A must be its ancestor for a two-dot range.
#   working-tree  the uncommitted changes (staged + unstaged + untracked)
#
# Classification and refusal only — no resolution or review judgment. Prints, to
# stdout, key=value lines a caller parses:
#   SCOPE=committed-range | working-tree
#   BASE=<immutable comparison-base-sha> | WORKING_TREE
#   HEAD_SHA=<immutable HEAD sha>
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
  tree_status=$(GIT_OPTIONAL_LOCKS=0 git status --porcelain=v1 --untracked-files=normal 2>/dev/null) \
    || fail "git status --porcelain failed while checking working tree state"
  [ -n "$tree_status" ]
}

emit_files_committed() {
  # Files changed in the range, three-dot semantics already baked into $base.
  echo "FILES"
  git diff --name-only "$1..$2" \
    || fail "git diff --name-only failed while resolving committed-range files"
}

emit_files_working_tree() {
  echo "FILES"
  # Tracked changes plus untracked-not-ignored, deduped. `diff HEAD` shows the
  # net worktree-vs-HEAD change; add `diff --cached` so a file whose index
  # differs but whose worktree is back at HEAD (staged then reverted) is still
  # listed — the scope is staged + unstaged + untracked, matching tree_is_dirty.
  tracked=$(git diff --name-only HEAD) \
    || fail "git diff --name-only HEAD failed while resolving working-tree files"
  staged=$(git diff --cached --name-only) \
    || fail "git diff --cached --name-only failed while resolving working-tree files"
  untracked=$(git ls-files --others --exclude-standard) \
    || fail "git ls-files failed while resolving working-tree files"
  printf '%s\n%s\n%s\n' "$tracked" "$staged" "$untracked" | sed '/^$/d' | sort -u
}

resolve_working_tree() {
  if ! tree_is_dirty; then
    fail "working-tree scope requested but the tree is clean — nothing to resolve"
  fi
  head_sha=$(git rev-parse --verify HEAD) \
    || fail "HEAD does not resolve to a commit"
  echo "SCOPE=working-tree"
  echo "BASE=WORKING_TREE"
  echo "HEAD_SHA=$head_sha"
  emit_files_working_tree
}

resolve_committed_range() {
  base=$1
  resolved_head=$2
  if tree_is_dirty; then
    fail "committed-range scope but the working tree is dirty — commit or stash first (mixed scope refused)"
  fi
  echo "SCOPE=committed-range"
  echo "BASE=$base"
  echo "HEAD_SHA=$resolved_head"
  emit_files_committed "$base" "$resolved_head"
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
    right_sha=$(git rev-parse --verify HEAD)
    resolve_committed_range "$merge_base" "$right_sha"
    ;;
  *..*)
    # Resolve both endpoints once and require the right endpoint to be HEAD.
    # Three-dot Git diff semantics compare the endpoints' merge base with HEAD,
    # so emit that canonical comparison as BASE..HEAD_SHA.
    case "$scope_arg" in
      *...*)
        left=${scope_arg%%...*}
        right=${scope_arg#*...}
        ;;
      *)
        left=${scope_arg%%..*}
        right=${scope_arg#*..}
        ;;
    esac
    [ -n "$left" ] || fail "range left revision is missing"
    [ -n "$right" ] || fail "range right revision is missing"

    left_sha=$(git rev-parse --verify --quiet "$left^{commit}") \
      || fail "range left revision '$left' does not resolve to a commit"
    right_sha=$(git rev-parse --verify --quiet "$right^{commit}") \
      || fail "range right revision '$right' does not resolve to a commit"
    head_sha=$(git rev-parse --verify HEAD)
    if [ "$right_sha" != "$head_sha" ]; then
      fail "range right revision must resolve to HEAD"
    fi
    case "$scope_arg" in
      *...*)
        base_ref=$(git merge-base "$left_sha" "$right_sha" 2>/dev/null) \
          || fail "cannot compute merge-base for range '$scope_arg'"
        ;;
      *)
        git merge-base --is-ancestor "$left_sha" "$right_sha" \
          || fail "two-dot range left revision must be an ancestor of HEAD; use three-dot for divergent histories"
        base_ref=$left_sha
        ;;
    esac
    resolve_committed_range "$base_ref" "$right_sha"
    ;;
  *)
    fail "unrecognized scope '$scope_arg' — expected a range (A..B / A...B) or 'working-tree'"
    ;;
esac
