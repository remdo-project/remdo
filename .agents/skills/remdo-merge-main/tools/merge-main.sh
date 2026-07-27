#!/usr/bin/env sh
# Deterministic state machine for remdo-merge-main.
# Usage:
#   merge-main.sh status
#   merge-main.sh start [--preserve]
#   merge-main.sh continue
#   merge-main.sh finish [--verification-failed]
#   merge-main.sh complete-restore
set -eu

fail() {
  echo "merge-main: $1" >&2
  exit 1
}

git rev-parse --git-dir >/dev/null 2>&1 \
  || fail "not a git repository"

state_dir=$(git rev-parse --path-format=absolute --git-path remdo-merge-main)
common_dir=$(git rev-parse --path-format=absolute --git-common-dir)
stash_lock_dir="$common_dir/remdo-merge-main-stash.lock"
stash_lock_held=no

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
  run_saved_ref=$(state_value saved-ref)
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
    "$state_dir/saved-ref" \
    "$state_dir/stash-marker"
  if ! rmdir "$state_dir"; then
    leftover_dir="$state_dir-leftovers-$$"
    mv "$state_dir" "$leftover_dir"
    echo "merge-main: retained unexpected run-state entries at $leftover_dir" >&2
  fi
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

release_stash_lock() {
  if [ "$stash_lock_held" = yes ]; then
    rm -f "$stash_lock_dir/pid"
    rmdir "$stash_lock_dir" 2>/dev/null || true
    stash_lock_held=no
  fi
}

acquire_stash_lock() {
  if ! mkdir "$stash_lock_dir" 2>/dev/null; then
    [ -f "$stash_lock_dir/pid" ] \
      || fail "preservation lock is initializing or incomplete"
    lock_pid=$(sed -n '1p' "$stash_lock_dir/pid")
    case "$lock_pid" in
      ''|*[!0-9]*)
        fail "preservation lock has an invalid owner"
        ;;
    esac
    if kill -0 "$lock_pid" 2>/dev/null; then
      fail "another worktree is preserving local work"
    fi
    rm -f "$stash_lock_dir/pid"
    rmdir "$stash_lock_dir" \
      || fail "stale preservation lock could not be recovered"
    mkdir "$stash_lock_dir" \
      || fail "preservation lock could not be acquired"
  fi
  printf '%s\n' "$$" >"$stash_lock_dir/pid"
  stash_lock_held=yes
  trap 'release_stash_lock' EXIT
  trap 'release_stash_lock; exit 1' HUP INT TERM
}

stash_entry_for_marker() {
  git stash list --format='%H %gd %gs' \
    | grep -F -- "$1" | sed -n '1p'
}

remove_shared_stash() {
  entry=$(stash_entry_for_marker "$run_stash_marker")
  [ -n "$entry" ] || return 0
  entry_hash=${entry%% *}
  rest=${entry#* }
  entry_ref=${rest%% *}
  [ "$entry_hash" = "$run_stash" ] \
    || fail "preserved work does not match its shared stash entry"
  git stash drop --quiet "$entry_ref"
}

drop_saved_work() {
  saved=$(git rev-parse --verify --quiet "$run_saved_ref" || true)
  [ -z "$saved" ] \
    || git update-ref -d "$run_saved_ref" "$run_stash"
}

restore_saved_work() {
  final_state=$1
  run_outcome=$final_state
  write_value outcome "$run_outcome"
  if [ -z "$run_stash" ]; then
    if [ -n "$run_saved_ref" ]; then
      saved=$(git rev-parse --verify --quiet "$run_saved_ref" || true)
      if [ -n "$saved" ]; then
        [ "$saved" = "$run_start_head" ] \
          || fail "saved-work reservation belongs to another run"
        git update-ref -d "$run_saved_ref" "$run_start_head"
      fi
    fi
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
      if git merge-base --is-ancestor "$run_target" HEAD; then
        emit_state verification-needed
      elif [ "$(git rev-parse HEAD)" = "$run_start_head" ]; then
        write_value phase prepared
        run_phase=prepared
        emit_state integration-ready
      else
        emit_state stopped
      fi
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
    restore-uncertain)
      emit_state restore-uncertain
      ;;
    restore-pending)
      emit_state restore-pending
      ;;
    *)
      fail "unknown run phase: $run_phase"
      ;;
  esac
}

initialize_state() {
  initial_dir="$state_dir-initial-$$"
  mkdir "$initial_dir"
  printf '%s\n' "$run_branch" >"$initial_dir/branch"
  printf '%s\n' "$run_start_head" >"$initial_dir/start-head"
  printf '%s\n' "$run_target" >"$initial_dir/target"
  printf '%s\n' "$run_incoming" >"$initial_dir/incoming"
  printf '%s\n' "$run_form" >"$initial_dir/form"
  printf '%s\n' "$run_outcome" >"$initial_dir/outcome"
  printf '%s\n' "$run_phase" >"$initial_dir/phase"
  printf '%s\n' "$run_stash" >"$initial_dir/stash"
  printf '%s\n' "$run_saved_ref" >"$initial_dir/saved-ref"
  printf '%s\n' "$run_stash_marker" >"$initial_dir/stash-marker"
  mv -T "$initial_dir" "$state_dir"
}

reserve_saved_ref() {
  saved_ref_base="refs/remdo-merge-main/saved-$run_target-$$"
  saved_ref_suffix=
  saved_ref_number=0
  while :; do
    candidate="$saved_ref_base$saved_ref_suffix"
    if git update-ref "$candidate" "$run_start_head" "" 2>/dev/null; then
      run_saved_ref=$candidate
      run_stash_marker="remdo-merge-main-${candidate##*/}"
      return
    fi
    git rev-parse --verify --quiet "$candidate" >/dev/null \
      || fail "saved-work identity could not be reserved"
    saved_ref_number=$((saved_ref_number + 1))
    saved_ref_suffix="-$saved_ref_number"
  done
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
      git merge --quiet --no-edit --no-ff "$run_target" >/dev/null
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
  [ "$stash_lock_held" = yes ] || acquire_stash_lock
  current_saved=$(git rev-parse --verify --quiet "$run_saved_ref" || true)
  [ -n "$current_saved" ] \
    || fail "saved-work identity is missing"
  if [ -z "$run_stash" ]; then
    [ "$current_saved" = "$run_start_head" ] \
      || fail "saved-work identity belongs to another run"
    entry=$(stash_entry_for_marker "$run_stash_marker")
    if [ -z "$entry" ]; then
      git stash push --quiet --include-untracked \
        --message "$run_stash_marker"
      entry=$(stash_entry_for_marker "$run_stash_marker")
    fi
    if [ -z "$entry" ]; then
      release_stash_lock
      echo "merge-main: local work could not be preserved" >&2
      restore_saved_work stopped
      return 1
    fi
    run_stash=${entry%% *}
    write_value stash "$run_stash"
  elif [ "$current_saved" != "$run_start_head" ] \
    && [ "$current_saved" != "$run_stash" ]; then
    fail "saved-work identity does not match preserved work"
  fi

  if [ "$current_saved" = "$run_start_head" ]; then
    git update-ref "$run_saved_ref" "$run_stash" "$run_start_head" \
      || fail "preserved work could not be journaled"
  fi
  remove_shared_stash
  release_stash_lock
  if [ -n "$(git status --porcelain --untracked-files=normal)" ]; then
    echo "merge-main: preservation did not produce a clean committed state" >&2
    restore_saved_work stopped
    return 1
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

  git fetch --quiet --prune --no-tags origin
  run_target=$(git rev-parse --verify --quiet \
    'refs/remotes/origin/main^{commit}') \
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
  run_saved_ref=
  run_stash_marker=
  if [ "$preserve" = yes ] && [ -n "$dirty" ]; then
    run_phase=preserving
    acquire_stash_lock
    reserve_saved_ref
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
    restore-pending)
      if has_unmerged_paths; then
        write_value phase restore-conflicted
        run_phase=restore-conflicted
        emit_state restore-conflicted
      elif [ -n "$(git status --porcelain --untracked-files=normal)" ]; then
        write_value phase restore-uncertain
        run_phase=restore-uncertain
        emit_state restore-uncertain
      else
        restore_saved_work "$run_outcome"
      fi
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
  if [ "$run_form" = merge-commit ]; then
    write_value phase verification
    run_phase=verification
    emit_state verification-needed
  else
    write_value phase ready-to-restore
    run_phase=ready-to-restore
    emit_state finish-needed
  fi
}

finish_run() {
  verification_failed=no
  case "${1-}" in
    "")
      ;;
    --verification-failed)
      verification_failed=yes
      ;;
    *)
      fail "usage: merge-main.sh finish [--verification-failed]"
      ;;
  esac
  [ "$#" -le 1 ] \
    || fail "usage: merge-main.sh finish [--verification-failed]"
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
  [ "$verification_failed" = no ] \
    || [ "$run_phase" = verification ] \
    || fail "verification failure requires a merge awaiting verification"
  operation_in_progress \
    && fail "a Git operation is still in progress"
  git merge-base --is-ancestor "$run_target" HEAD \
    || fail "branch no longer contains the fixed target"
  git merge-base --is-ancestor "$run_start_head" HEAD \
    || fail "branch no longer contains its original head"
  [ -z "$(git status --porcelain --untracked-files=normal)" ] \
    || fail "integration state is not clean and committed"
  if [ "$verification_failed" = yes ]; then
    run_outcome=verification-failed
    write_value outcome "$run_outcome"
  fi
  restore_saved_work "$run_outcome"
}

complete_restore() {
  [ -d "$state_dir" ] \
    || fail "no remdo-merge-main run exists"
  load_state
  require_run_branch
  case "$run_phase" in
    restore-applied|restore-conflicted|restore-uncertain)
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
    shift
    finish_run "$@"
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
