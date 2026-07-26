#!/usr/bin/env sh
# Resolve an optional change-scope input to immutable comparison SHAs and a file
# list; refuse mixed scopes.
# Usage: resolve-scope.sh [<range> | uncommitted]
#   no arg       select uncommitted when dirty, origin/main...HEAD otherwise
#   <range>      an explicit commit range: A..B or A...B. Both endpoints are
#                required and must resolve to commits; B must resolve to HEAD,
#                and A must be its ancestor for a two-dot range.
#   uncommitted  changes in current tracked files plus untracked-not-ignored
#
# Prints, to stdout, key=value lines a caller parses:
#   STATE=ready | no-change
#   SCOPE=commit-range | uncommitted
#   BASE=<immutable comparison-base-sha> | UNCOMMITTED
#   HEAD_SHA=<immutable HEAD sha>
#   then a FILES section: a line "FILES", then one path per line
# Fails loud (non-zero + stderr) on every refused state; makes no commits, never
# writes the tree.
set -eu

fail() {
  echo "resolve-scope: $1" >&2
  exit 1
}

git rev-parse --git-dir >/dev/null 2>&1 || fail "not a git repository"
[ "$#" -le 1 ] || fail "expected at most one scope input"

scope_arg=${1-}

# A commit range must run against a clean tree: staged/unstaged/untracked
# changes sit outside the resolved range and would be silently unreviewed
# by a commit-range caller. This is the mixed-scope refusal — a commit range
# requested while uncommitted work is present.
tree_is_dirty() {
  tree_status=$(GIT_OPTIONAL_LOCKS=0 git status --porcelain=v1 --untracked-files=normal 2>/dev/null) \
    || fail "git status --porcelain failed while checking working tree state"
  [ -n "$tree_status" ]
}

list_commit_range_files() {
  # Files changed in the range, three-dot semantics already baked into $base.
  git diff --name-only "$1..$2" \
    || fail "git diff --name-only failed while resolving commit-range files"
}

list_uncommitted_files() {
  # `diff HEAD` compares current tracked file contents with the current commit,
  # leaving index-only bookkeeping out of the selected change.
  tracked=$(git diff --name-only HEAD) \
    || fail "git diff --name-only HEAD failed while resolving uncommitted files"
  untracked=$(git ls-files --others --exclude-standard) \
    || fail "git ls-files failed while resolving uncommitted files"
  printf '%s\n%s\n' "$tracked" "$untracked" | sed '/^$/d' | sort -u
}

emit_resolution() {
  scope=$1
  base=$2
  resolved_head=$3
  files=$4
  if [ -n "$files" ]; then
    echo "STATE=ready"
  else
    echo "STATE=no-change"
  fi
  echo "SCOPE=$scope"
  echo "BASE=$base"
  echo "HEAD_SHA=$resolved_head"
  echo "FILES"
  [ -z "$files" ] || printf '%s\n' "$files"
}

resolve_uncommitted() {
  head_sha=$(git rev-parse --verify HEAD) \
    || fail "HEAD does not resolve to a commit"
  files=$(list_uncommitted_files)
  emit_resolution "uncommitted" "UNCOMMITTED" "$head_sha" "$files"
}

resolve_commit_range() {
  base=$1
  resolved_head=$2
  if tree_is_dirty; then
    fail "commit-range scope but the repository is dirty — commit or stash first (mixed scope refused)"
  fi
  files=$(list_commit_range_files "$base" "$resolved_head")
  emit_resolution "commit-range" "$base" "$resolved_head" "$files"
}

case "$scope_arg" in
  uncommitted)
    resolve_uncommitted
    ;;
  '')
    if tree_is_dirty; then
      resolve_uncommitted
      exit 0
    fi
    git rev-parse --verify --quiet origin/main >/dev/null \
      || fail "origin/main not found — cannot compute the task-branch default; pass an explicit range"
    merge_base=$(git merge-base origin/main HEAD 2>/dev/null) \
      || fail "no merge-base with origin/main — cannot compute the task-branch default; pass an explicit range"
    right_sha=$(git rev-parse --verify HEAD)
    resolve_commit_range "$merge_base" "$right_sha"
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
    resolve_commit_range "$base_ref" "$right_sha"
    ;;
  *)
    fail "unrecognized scope '$scope_arg' — expected a range (A..B / A...B) or 'uncommitted'"
    ;;
esac
