#!/usr/bin/env sh
# Resolve an optional change-scope input as a complete ChangeScopeResult; refuse
# mixed scopes.
# Usage: resolve-scope.sh [<range> | uncommitted]
#   no arg       select uncommitted when dirty, origin/main...HEAD otherwise
#   <range>      an explicit commit range: A..B or A...B. Both endpoints are
#                required and must resolve to commits; B must resolve to HEAD,
#                and A must be its ancestor for a two-dot range.
#   uncommitted  staged, unstaged, and untracked-not-ignored changes
#
# On success, prints to stdout key=value lines a caller parses:
#   STATE=ready | no-change
#   SELECTION=uncommitted | <requested or default Git range>
#   KIND=commit-range | uncommitted
#   BASE=<immutable comparison-base-sha> | UNCOMMITTED
#   HEAD=<immutable HEAD sha>
#   then a FILES section: a line "FILES", then one path per line
# On failure, exits non-zero and prints STATE=failed, optional INPUT, and REASON
# to stderr. Makes no commits and never writes the tree.
set -eu

scope_arg=${1-}
if [ "$#" -eq 1 ]; then
  input_supplied=true
else
  input_supplied=false
fi

fail() {
  echo "STATE=failed" >&2
  if [ "$input_supplied" = true ]; then
    echo "INPUT=$scope_arg" >&2
  fi
  echo "REASON=$1" >&2
  exit 1
}

git rev-parse --git-dir >/dev/null 2>&1 || fail "not a git repository"
[ "$#" -le 1 ] || fail "expected at most one scope input"

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
  staged=$(git diff --cached --name-only HEAD) \
    || fail "git diff --cached failed while resolving uncommitted files"
  unstaged=$(git diff --name-only) \
    || fail "git diff failed while resolving uncommitted files"
  untracked=$(git ls-files --others --exclude-standard) \
    || fail "git ls-files failed while resolving uncommitted files"
  printf '%s\n%s\n%s\n' "$staged" "$unstaged" "$untracked" \
    | sed '/^$/d' | sort -u
}

emit_resolution() {
  selection=$1
  kind=$2
  base=$3
  resolved_head=$4
  files=$5
  if [ -n "$files" ]; then
    echo "STATE=ready"
  else
    echo "STATE=no-change"
  fi
  echo "SELECTION=$selection"
  echo "KIND=$kind"
  echo "BASE=$base"
  echo "HEAD=$resolved_head"
  echo "FILES"
  [ -z "$files" ] || printf '%s\n' "$files"
}

resolve_uncommitted() {
  head_sha=$(git rev-parse --verify HEAD) \
    || fail "HEAD does not resolve to a commit"
  files=$(list_uncommitted_files)
  emit_resolution "uncommitted" "uncommitted" "UNCOMMITTED" "$head_sha" "$files"
}

resolve_commit_range() {
  base=$1
  resolved_head=$2
  selection=$3
  if tree_is_dirty; then
    fail "commit-range scope but the repository is dirty — commit or stash first (mixed scope refused)"
  fi
  files=$(list_commit_range_files "$base" "$resolved_head")
  emit_resolution "$selection" "commit-range" "$base" "$resolved_head" "$files"
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
    resolve_commit_range "$merge_base" "$right_sha" "origin/main...HEAD"
    ;;
  *..*)
    # Resolve both endpoints once and require the right endpoint to be HEAD.
    # Three-dot Git diff semantics compare the endpoints' merge base with HEAD,
    # so emit that canonical comparison as BASE..HEAD.
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
    head_sha=$(git rev-parse --verify --quiet HEAD^{commit}) \
      || fail "HEAD does not resolve to a commit"
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
    resolve_commit_range "$base_ref" "$right_sha" "$scope_arg"
    ;;
  *)
    fail "unrecognized scope '$scope_arg' — expected a range (A..B / A...B) or 'uncommitted'"
    ;;
esac
