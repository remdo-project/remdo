#!/usr/bin/env sh
# Deterministic Git operations for remdo-merge-main.
# Usage:
#   merge-main.sh start [--preserve]
#   merge-main.sh continue <target>
#   merge-main.sh restore <stash-commit>
#   merge-main.sh complete-restore <stash-commit> --resolved
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

find_stash() {
  if ! stash_entries=$(git stash list --format='%gd %H'); then
    fail "saved work could not be inspected"
  fi
  stash_selector=$(
    printf '%s\n' "$stash_entries" \
      | awk -v oid="$1" '$2 == oid { print $1; exit }'
  )
  [ -n "$stash_selector" ] \
    || fail "saved work is no longer present in the stash"
}

restore_saved_work() {
  restore_oid=$1
  find_stash "$restore_oid"
  if git stash apply --quiet --index "$restore_oid" 1>&2; then
    git stash drop --quiet "$stash_selector" \
      || fail "restored work could not be removed; retained stash $restore_oid"
    restore_state=restored
  else
    restore_state=restore-conflicted
  fi
}

emit_run_state() {
  printf 'STATE=%s\n' "$1"
  printf 'BRANCH=%s\n' "$run_branch"
  printf 'TARGET=%s\n' "$run_target"
  printf 'INCOMING=%s\n' "$run_incoming"
  printf 'FORM=%s\n' "$run_form"
  if [ "$run_preserved" = yes ]; then
    printf 'PRESERVED=yes\n'
    if [ -n "$run_stash" ]; then
      printf 'STASH=%s\n' "$run_stash"
    fi
  else
    printf 'PRESERVED=no\n'
  fi
}

merge_with_neutral_options() {
  inherited_config_count=${GIT_CONFIG_COUNT:-0}
  case "$inherited_config_count" in
    *[!0-9]*)
      fail "inherited Git configuration count is invalid"
      ;;
  esac
  while [ "${inherited_config_count#0}" != "$inherited_config_count" ]; do
    inherited_config_count=${inherited_config_count#0}
  done
  [ -n "$inherited_config_count" ] || inherited_config_count=0
  override_config_count=$((inherited_config_count + 1))
  env \
    "GIT_CONFIG_COUNT=$override_config_count" \
    "GIT_CONFIG_KEY_$inherited_config_count=branch.$run_branch.mergeOptions" \
    "GIT_CONFIG_VALUE_$inherited_config_count=" \
    git merge "$@" 1>&2
}

start_run() {
  preserve=no
  case "${1-}" in
    "")
      ;;
    --preserve)
      preserve=yes
      ;;
    *)
      fail "usage: merge-main.sh start [--preserve]"
      ;;
  esac
  [ "$#" -le 1 ] \
    || fail "usage: merge-main.sh start [--preserve]"

  run_branch=$(current_branch)
  run_start_head=$(git rev-parse --verify HEAD)
  operation_in_progress \
    && fail "another Git operation is already in progress"
  read_unmerged_paths
  [ -z "$unmerged_paths" ] \
    || fail "working tree has unresolved paths"
  read_working_status
  initial_status=$working_status
  if [ -n "$initial_status" ] && [ "$preserve" = no ]; then
    fail "working tree is dirty; use explicit preserve mode or clean it first"
  fi

  git fetch --quiet --refmap= origin refs/heads/main \
    || fail "could not fetch origin/main"
  [ "$(current_branch)" = "$run_branch" ] \
    || fail "destination branch changed during fetch"
  [ "$(git rev-parse --verify HEAD)" = "$run_start_head" ] \
    || fail "destination HEAD changed during fetch"
  read_working_status
  [ "$working_status" = "$initial_status" ] \
    || fail "working tree changed during fetch"

  run_target=$(git rev-parse --verify --quiet 'FETCH_HEAD^{commit}' || true)
  [ -n "$run_target" ] \
    || fail "origin/main not found after fetch"
  git merge-base "$run_start_head" "$run_target" >/dev/null 2>&1 \
    || fail "HEAD and origin/main have unrelated histories"
  git update-ref refs/remotes/origin/main "$run_target" \
    || fail "origin/main could not be updated"
  run_incoming=$(git rev-list --count "$run_start_head..$run_target")
  run_stash=
  run_preserved=no

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

  if [ -n "$initial_status" ]; then
    if git stash push --quiet --include-untracked --message remdo-merge-main; then
      stash_status=0
    else
      stash_status=$?
    fi
    read_working_status
    [ "$working_status" != "$initial_status" ] \
      || fail "local work could not be saved; working tree was unchanged"
    run_stash=$(git rev-parse --verify --quiet 'stash@{0}^{commit}' || true)
    [ -n "$run_stash" ] \
      || fail "local work changed but its stash could not be identified"
    run_preserved=yes
    [ "$stash_status" -eq 0 ] \
      || fail "local work was saved but stash failed; recover stash $run_stash before continuing"
    [ -z "$working_status" ] \
      || fail "local work was partially saved; recover stash $run_stash before continuing"
  fi

  case "$run_form" in
    fast-forward)
      merge_with_neutral_options \
        --quiet --ff-only --no-squash "$run_target" \
        || true
      if is_ancestor "$run_target" HEAD \
        && is_ancestor "$run_start_head" HEAD \
        && ! operation_in_progress; then
        if [ -n "$run_stash" ]; then
          restore_saved_work "$run_stash"
          if [ "$restore_state" = restore-conflicted ]; then
            emit_run_state restore-conflicted
            return
          fi
          run_stash=
        fi
        emit_run_state fast-forwarded
        return
      fi
      ;;
    merge-commit)
      merge_with_neutral_options \
        --quiet --commit --no-edit --no-ff --no-squash "$run_target" \
        || true
      if is_ancestor "$run_target" HEAD \
        && is_ancestor "$run_start_head" HEAD \
        && ! operation_in_progress; then
        emit_run_state verification-needed
        return
      fi
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
  if [ -n "$run_stash" ]; then
    fail "integration failed; saved work remains in stash $run_stash"
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

  GIT_EDITOR=true git merge --continue 1>&2 \
    || fail "merge commit could not be completed"
  is_ancestor "$expected_target" HEAD \
    || fail "branch no longer contains the fixed target"
  operation_in_progress \
    && fail "a Git operation remains after the merge commit"
  printf 'STATE=verification-needed\n'
  printf 'TARGET=%s\n' "$expected_target"
}

restore_run() {
  [ "$#" -eq 1 ] \
    || fail "usage: merge-main.sh restore <stash-commit>"
  operation_in_progress \
    && fail "another Git operation is already in progress"
  read_unmerged_paths
  [ -z "$unmerged_paths" ] \
    || fail "restoration conflicts are already present"
  restore_oid=$(git rev-parse --verify --quiet "$1^{commit}" || true)
  [ -n "$restore_oid" ] \
    || fail "saved work is not a commit"
  restore_saved_work "$restore_oid"
  printf 'STATE=%s\n' "$restore_state"
  if [ "$restore_state" = restore-conflicted ]; then
    printf 'STASH=%s\n' "$restore_oid"
  fi
}

complete_restore() {
  [ "$#" -eq 2 ] && [ "$2" = --resolved ] \
    || fail "usage: merge-main.sh complete-restore <stash-commit> --resolved"
  operation_in_progress \
    && fail "another Git operation is already in progress"
  read_unmerged_paths
  [ -z "$unmerged_paths" ] \
    || fail "restoration conflicts remain unresolved"
  restore_oid=$(git rev-parse --verify --quiet "$1^{commit}" || true)
  [ -n "$restore_oid" ] \
    || fail "saved work is not a commit"
  find_stash "$restore_oid"
  git stash drop --quiet "$stash_selector" \
    || fail "restored work could not be removed from the stash"
  printf 'STATE=restored\n'
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
  restore)
    restore_run "$@"
    ;;
  complete-restore)
    complete_restore "$@"
    ;;
  *)
    fail "unknown command: $command"
    ;;
esac
