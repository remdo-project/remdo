#!/usr/bin/env sh
# Deterministic Git operations for remdo-merge-main.
# Usage:
#   merge-main.sh start
#   merge-main.sh continue <target>
set -eu

fail() {
  echo "merge-main: $1" >&2
  exit 1
}

is_ancestor() {
  git merge-base --is-ancestor "$1" "$2" && return 0
  ancestor_status=$?
  [ "$ancestor_status" -eq 1 ] && return 1
  fail "commit ancestry could not be inspected"
}

current_branch() {
  branch=$(git symbolic-ref --quiet --short HEAD) \
    || fail "destination must be an attached branch"
  [ -n "$branch" ] || fail "destination must be an attached branch"
  printf '%s\n' "$branch"
}

non_merge_operation_in_progress() {
  [ -e "$(git rev-parse --git-path CHERRY_PICK_HEAD)" ] \
    || [ -e "$(git rev-parse --git-path REVERT_HEAD)" ] \
    || [ -e "$(git rev-parse --git-path BISECT_LOG)" ] \
    || [ -d "$(git rev-parse --git-path rebase-apply)" ] \
    || [ -d "$(git rev-parse --git-path rebase-merge)" ] \
    || [ -d "$(git rev-parse --git-path sequencer)" ]
}

operation_in_progress() {
  [ -e "$(git rev-parse --git-path MERGE_HEAD)" ] \
    || non_merge_operation_in_progress
}

read_unmerged_paths() {
  if ! unmerged_paths=$(git diff --name-only --diff-filter=U); then
    fail "unmerged paths could not be inspected"
  fi
}

read_working_status() {
  if ! working_status=$(git status --porcelain=v1 --untracked-files=normal); then
    fail "working tree could not be inspected"
  fi
}

read_untracked_paths() {
  if ! untracked_paths=$(git ls-files --others --exclude-standard -- ':/'); then
    fail "untracked paths could not be inspected"
  fi
}

emit_run_state() {
  printf 'STATE=%s\n' "$1"
  printf 'BRANCH=%s\n' "$run_branch"
  printf 'TARGET=%s\n' "$run_target"
  printf 'INCOMING=%s\n' "$run_incoming"
  printf 'FORM=%s\n' "$run_form"
}

merge_with_neutral_options() {
  REMDO_EMPTY_MERGE_OPTIONS= git \
    --config-env="branch.$run_branch.mergeOptions=REMDO_EMPTY_MERGE_OPTIONS" \
    merge "$@" 1>&2
}

start_run() {
  [ "$#" -eq 0 ] \
    || fail "usage: merge-main.sh start"

  run_branch=$(current_branch)
  run_start_head=$(git rev-parse --verify HEAD)
  operation_in_progress \
    && fail "another Git operation is already in progress"
  read_unmerged_paths
  [ -z "$unmerged_paths" ] \
    || fail "working tree has unresolved paths"
  read_working_status
  [ -z "$working_status" ] \
    || fail "working tree is dirty; clean it before merging"

  git fetch --quiet --no-tags origin \
    '+refs/heads/main:refs/remotes/origin/main' \
    || fail "could not fetch origin/main"

  run_target=$(git rev-parse --verify --quiet \
    'refs/remotes/origin/main^{commit}') \
    || fail "origin/main not found after fetch"
  git merge-base "$run_start_head" "$run_target" >/dev/null 2>&1 \
    || fail "HEAD and origin/main have unrelated histories"
  run_incoming=$(git rev-list --count "$run_start_head..$run_target")

  if is_ancestor "$run_target" "$run_start_head"; then
    run_form=up-to-date
    emit_run_state up-to-date
    return
  fi
  if is_ancestor "$run_start_head" "$run_target"; then
    run_form=fast-forward
  else
    run_form=merge-commit
  fi

  case "$run_form" in
    fast-forward)
      merge_with_neutral_options \
        --quiet --ff-only --no-squash "$run_target" \
        || true
      if is_ancestor "$run_target" HEAD \
        && is_ancestor "$run_start_head" HEAD \
        && ! operation_in_progress; then
        emit_run_state fast-forwarded
        return
      fi
      ;;
    merge-commit)
      merge_with_neutral_options \
        --quiet --no-commit --no-edit --no-ff --no-squash "$run_target" \
        || true
      merge_head=$(git rev-parse --verify --quiet MERGE_HEAD || true)
      if [ "$merge_head" = "$run_target" ]; then
        read_unmerged_paths
        if [ -n "$unmerged_paths" ]; then
          emit_run_state conflicted
        else
          emit_run_state merge-ready
        fi
        return
      fi
      ;;
  esac

  if operation_in_progress; then
    fail "an unexpected Git operation remains after integration"
  fi
  fail "integration failed"
}

continue_run() {
  [ "$#" -eq 1 ] \
    || fail "usage: merge-main.sh continue <target>"
  expected_target=$(git rev-parse --verify --quiet "$1^{commit}" || true)
  [ -n "$expected_target" ] \
    || fail "fixed target is not a commit"
  merge_head=$(git rev-parse --verify --quiet MERGE_HEAD || true)
  [ "$merge_head" = "$expected_target" ] \
    || fail "merge operation does not match the fixed target"
  non_merge_operation_in_progress \
    && fail "another Git operation is already in progress"
  read_unmerged_paths
  [ -z "$unmerged_paths" ] \
    || fail "merge conflicts remain unresolved"
  git diff --quiet \
    || fail "unstaged merge-resolution changes remain"
  read_untracked_paths
  [ -z "$untracked_paths" ] \
    || fail "untracked merge-resolution files remain"

  GIT_EDITOR=true git -c core.hooksPath=/dev/null merge --continue 1>&2 \
    || fail "merge commit could not be completed"
  is_ancestor "$expected_target" HEAD \
    || fail "branch no longer contains the fixed target"
  operation_in_progress \
    && fail "a Git operation remains after the merge commit"
  printf 'STATE=merged\n'
  printf 'TARGET=%s\n' "$expected_target"
}

git rev-parse --git-dir >/dev/null 2>&1 \
  || fail "not a git repository"

command=${1-}
[ -n "$command" ] || fail "missing command"
shift

case "$command" in
  start)
    start_run "$@"
    ;;
  continue)
    continue_run "$@"
    ;;
  *)
    fail "unknown command: $command"
    ;;
esac
