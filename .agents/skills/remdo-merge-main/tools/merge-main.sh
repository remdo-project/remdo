#!/usr/bin/env sh
# Deterministic state machine for remdo-merge-main.
# Usage:
#   merge-main.sh status
#   merge-main.sh start [--preserve]
#   merge-main.sh continue
#   merge-main.sh finish
#   merge-main.sh complete-restore
set -eu

fail() {
  echo "merge-main: $1" >&2
  exit 1
}

git rev-parse --git-dir >/dev/null 2>&1 \
  || fail "not a git repository"

state_dir=$(git rev-parse --path-format=absolute --git-path remdo-merge-main)

state_value() {
  [ -f "$state_dir/$1" ] \
    || fail "run state is incomplete: missing $1"
  sed -n '1p' "$state_dir/$1"
}

write_value() {
  printf '%s\n' "$2" >"$state_dir/$1"
}

load_state() {
  run_branch=$(state_value branch)
  run_start_head=$(state_value start-head)
  run_target=$(state_value target)
  run_incoming=$(state_value incoming)
  run_form=$(state_value form)
  run_outcome=$(state_value outcome)
  run_phase=$(state_value phase)
  run_stash=$(state_value stash)
  run_stash_before=$(state_value stash-before)
  run_stash_marker=$(state_value stash-marker)
}

emit_state() {
  printf 'STATE=%s\n' "$1"
  printf 'BRANCH=%s\n' "$run_branch"
  printf 'TARGET=%s\n' "$run_target"
  printf 'INCOMING=%s\n' "$run_incoming"
  printf 'FORM=%s\n' "$run_form"
  if [ -n "$run_stash" ]; then
    printf 'PRESERVED=yes\n'
    printf 'STASH=%s\n' "$run_stash"
  else
    printf 'PRESERVED=no\n'
  fi
}

clear_state() {
  rm -f \
    "$state_dir/branch" \
    "$state_dir/start-head" \
    "$state_dir/target" \
    "$state_dir/incoming" \
    "$state_dir/form" \
    "$state_dir/outcome" \
    "$state_dir/phase" \
    "$state_dir/stash" \
    "$state_dir/stash-before" \
    "$state_dir/stash-marker"
  rmdir "$state_dir"
}

current_branch() {
  git symbolic-ref --quiet --short HEAD \
    || fail "detached HEAD is not a merge destination"
}

require_run_branch() {
  current=$(current_branch)
  [ "$current" = "$run_branch" ] \
    || fail "run belongs to branch $run_branch, not $current"
}

has_unmerged_paths() {
  [ -n "$(git diff --name-only --diff-filter=U)" ]
}

operation_in_progress() {
  [ -e "$(git rev-parse --git-path MERGE_HEAD)" ] \
    || [ -e "$(git rev-parse --git-path CHERRY_PICK_HEAD)" ] \
    || [ -e "$(git rev-parse --git-path REVERT_HEAD)" ] \
    || [ -e "$(git rev-parse --git-path BISECT_LOG)" ] \
    || [ -d "$(git rev-parse --git-path rebase-apply)" ] \
    || [ -d "$(git rev-parse --git-path rebase-merge)" ] \
    || [ -d "$(git rev-parse --git-path sequencer)" ]
}

stash_ref_for() {
  git stash list --format='%H %gd' \
    | awk -v wanted="$1" '$1 == wanted { print $2; exit }'
}

drop_saved_work() {
  ref=$(stash_ref_for "$run_stash")
  [ -n "$ref" ] \
    || fail "saved work $run_stash is no longer in the stash list"
  git stash drop --quiet "$ref"
}

restore_saved_work() {
  final_state=$1
  run_outcome=$final_state
  write_value outcome "$run_outcome"
  if [ -z "$run_stash" ]; then
    clear_state
    emit_state "$final_state"
    return
  fi

  write_value phase restore-pending
  set +e
  git stash apply --index "$run_stash" >/dev/null
  apply_status=$?
  set -e
  if [ "$apply_status" -ne 0 ]; then
    write_value phase restore-conflicted
    run_phase=restore-conflicted
    emit_state restore-conflicted
    return
  fi

  write_value phase restore-applied
  drop_saved_work
  clear_state
  emit_state "$final_state"
}

status_run() {
  if [ ! -d "$state_dir" ]; then
    echo "STATE=idle"
    return
  fi

  load_state
  require_run_branch
  case "$run_phase" in
    preserving)
      emit_state preservation-needed
      ;;
    prepared)
      emit_state integration-ready
      ;;
    merging)
      if has_unmerged_paths; then
        emit_state conflicted
      elif [ -e "$(git rev-parse --git-path MERGE_HEAD)" ]; then
        emit_state merge-ready
      elif git merge-base --is-ancestor "$run_target" HEAD; then
        if [ "$run_form" = merge-commit ]; then
          write_value phase verification
          run_phase=verification
          emit_state verification-needed
        else
          write_value phase ready-to-restore
          run_phase=ready-to-restore
          emit_state finish-needed
        fi
      elif [ "$(git rev-parse HEAD)" = "$run_start_head" ]; then
        write_value phase prepared
        run_phase=prepared
        emit_state integration-ready
      else
        emit_state stopped
      fi
      ;;
    verification)
      emit_state verification-needed
      ;;
    ready-to-restore)
      emit_state finish-needed
      ;;
    restore-applied)
      emit_state restore-ready
      ;;
    restore-conflicted)
      emit_state restore-conflicted
      ;;
    restore-pending)
      emit_state stopped
      ;;
    *)
      fail "unknown run phase: $run_phase"
      ;;
  esac
}

initialize_state() {
  mkdir "$state_dir"
  write_value branch "$run_branch"
  write_value start-head "$run_start_head"
  write_value target "$run_target"
  write_value incoming "$run_incoming"
  write_value form "$run_form"
  write_value outcome "$run_outcome"
  write_value phase "$run_phase"
  write_value stash "$run_stash"
  write_value stash-before "$run_stash_before"
  write_value stash-marker "$run_stash_marker"
}

integrate_target() {
  write_value phase merging
  run_phase=merging
  case "$run_form" in
    up-to-date)
      restore_saved_work up-to-date
      ;;
    fast-forward)
      if git merge --quiet --ff-only "$run_target"; then
        restore_saved_work fast-forwarded
      else
        restore_saved_work stopped
        return 1
      fi
      ;;
    merge-commit)
      set +e
      git merge --quiet --no-edit --no-ff "$run_target"
      merge_status=$?
      set -e
      if [ "$merge_status" -eq 0 ] \
        || git merge-base --is-ancestor "$run_target" HEAD; then
        write_value phase verification
        run_phase=verification
        emit_state verification-needed
      elif has_unmerged_paths \
        || [ -e "$(git rev-parse --git-path MERGE_HEAD)" ]; then
        emit_state conflicted
      else
        restore_saved_work stopped
        return 1
      fi
      ;;
  esac
}

preserve_and_integrate() {
  current_stash=$(git rev-parse --verify --quiet refs/stash || true)
  if [ "$current_stash" != "$run_stash_before" ]; then
    [ -n "$current_stash" ] \
      || fail "stash state changed while preservation was interrupted"
    stash_subject=$(git log -1 --format=%s "$current_stash")
    case "$stash_subject" in
      *"$run_stash_marker")
        ;;
      *)
        fail "stash state changed while preservation was interrupted"
        ;;
    esac
  else
    git stash push --quiet --include-untracked \
      --message "$run_stash_marker"
    current_stash=$(git rev-parse --verify --quiet refs/stash || true)
    if [ -z "$current_stash" ] \
      || [ "$current_stash" = "$run_stash_before" ]; then
      restore_saved_work stopped
      fail "local work could not be preserved"
    fi
  fi

  run_stash=$current_stash
  write_value stash "$run_stash"
  if [ -n "$(git status --porcelain --untracked-files=normal)" ]; then
    restore_saved_work stopped
    fail "preservation did not produce a clean committed state"
  fi

  write_value phase prepared
  run_phase=prepared
  integrate_target
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
  [ ! -e "$state_dir" ] \
    || fail "a remdo-merge-main run already exists; use status"

  run_branch=$(current_branch)
  run_start_head=$(git rev-parse --verify HEAD)
  operation_in_progress \
    && fail "another Git operation is already in progress"

  git fetch --quiet origin
  run_target=$(git rev-parse --verify --quiet 'origin/main^{commit}') \
    || fail "origin/main not found after fetch"
  git merge-base HEAD "$run_target" >/dev/null 2>&1 \
    || fail "HEAD and origin/main have unrelated histories"

  run_incoming=$(git rev-list --count "HEAD..$run_target")
  if git merge-base --is-ancestor "$run_target" HEAD; then
    run_form=up-to-date
    run_outcome=up-to-date
  elif git merge-base --is-ancestor HEAD "$run_target"; then
    run_form=fast-forward
    run_outcome=fast-forwarded
  else
    run_form=merge-commit
    run_outcome=merged
  fi

  dirty=$(git status --porcelain --untracked-files=normal)
  if [ -n "$dirty" ] && [ "$preserve" = no ]; then
    fail "working tree is dirty; use explicit preserve mode or clean it first"
  fi

  if [ "$preserve" = yes ]; then
    set +e
    git merge-tree --write-tree HEAD "$run_target" >/dev/null
    merge_tree_status=$?
    set -e
    case "$merge_tree_status" in
      0)
        ;;
      1)
        fail "fixed target does not merge cleanly with HEAD in preserve mode"
        ;;
      *)
        fail "could not preflight the fixed target in preserve mode"
        ;;
    esac
  fi

  run_stash=
  run_stash_before=
  run_stash_marker=
  if [ "$preserve" = yes ] && [ -n "$dirty" ]; then
    run_phase=preserving
    run_stash_before=$(git rev-parse --verify --quiet refs/stash || true)
    run_stash_marker="remdo-merge-main-$run_target-$$"
  else
    run_phase=prepared
  fi
  initialize_state

  if [ "$run_phase" = preserving ]; then
    preserve_and_integrate
  else
    integrate_target
  fi
}

continue_run() {
  [ -d "$state_dir" ] \
    || fail "no remdo-merge-main run exists"
  load_state
  require_run_branch
  case "$run_phase" in
    preserving)
      preserve_and_integrate
      return
      ;;
    prepared)
      integrate_target
      return
      ;;
    merging)
      ;;
    *)
      fail "run is not ready to continue integration"
      ;;
  esac

  if has_unmerged_paths; then
    emit_state conflicted
    return
  fi

  if [ -e "$(git rev-parse --git-path MERGE_HEAD)" ]; then
    git diff --quiet \
      || fail "unstaged merge-resolution changes remain"
    [ -z "$(git ls-files --others --exclude-standard)" ] \
      || fail "untracked merge-resolution files remain"
    git commit --quiet --no-edit
  fi

  git merge-base --is-ancestor "$run_target" HEAD \
    || fail "resolved merge does not contain the fixed target"
  write_value phase verification
  run_phase=verification
  emit_state verification-needed
}

finish_run() {
  [ -d "$state_dir" ] \
    || fail "no remdo-merge-main run exists"
  load_state
  require_run_branch
  case "$run_phase" in
    verification|ready-to-restore)
      ;;
    *)
      fail "run is not ready to finish"
      ;;
  esac
  operation_in_progress \
    && fail "a Git operation is still in progress"
  git merge-base --is-ancestor "$run_target" HEAD \
    || fail "branch no longer contains the fixed target"
  restore_saved_work "$run_outcome"
}

complete_restore() {
  [ -d "$state_dir" ] \
    || fail "no remdo-merge-main run exists"
  load_state
  require_run_branch
  case "$run_phase" in
    restore-applied|restore-conflicted)
      ;;
    *)
      fail "run is not waiting for restoration resolution"
      ;;
  esac
  has_unmerged_paths \
    && fail "restoration still has unmerged paths"
  [ -n "$run_stash" ] \
    || fail "run has no saved work"
  if [ "$run_phase" = restore-applied ]; then
    ref=$(stash_ref_for "$run_stash")
    [ -z "$ref" ] || git stash drop --quiet "$ref"
  else
    drop_saved_work
  fi
  clear_state
  emit_state "$run_outcome"
}

command=${1-status}
case "$command" in
  status)
    [ "$#" -eq 1 ] \
      || fail "usage: merge-main.sh status"
    status_run
    ;;
  start)
    shift
    start_run "$@"
    ;;
  continue)
    [ "$#" -eq 1 ] \
      || fail "usage: merge-main.sh continue"
    continue_run
    ;;
  finish)
    [ "$#" -eq 1 ] \
      || fail "usage: merge-main.sh finish"
    finish_run
    ;;
  complete-restore)
    [ "$#" -eq 1 ] \
      || fail "usage: merge-main.sh complete-restore"
    complete_restore
    ;;
  *)
    fail "usage: merge-main.sh <status|start|continue|finish|complete-restore>"
    ;;
esac
