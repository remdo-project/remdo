#!/usr/bin/env sh
# Deterministic state machine for remdo-merge-main.
# Usage:
#   merge-main.sh status
#   merge-main.sh start [--preserve]
#   merge-main.sh continue
#   merge-main.sh finish [--verification-failed]
#   merge-main.sh complete-restore [--resolved]
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
  value_temp="$state_dir/.$1-$$"
  value_number=0
  while [ -e "$value_temp" ]; do
    value_number=$((value_number + 1))
    value_temp="$state_dir/.$1-$$-$value_number"
  done
  if ! printf '%s\n' "$2" >"$value_temp"; then
    rm -f -- "$value_temp"
    fail "run state could not write $1"
  fi
  if ! mv -f "$value_temp" "$state_dir/$1"; then
    rm -f -- "$value_temp"
    fail "run state could not publish $1"
  fi
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
  completed_dir="$state_dir-completed-$$"
  completed_number=0
  while [ -e "$completed_dir" ]; do
    completed_number=$((completed_number + 1))
    completed_dir="$state_dir-completed-$$-$completed_number"
  done
  mv "$state_dir" "$completed_dir" \
    || fail "completed run state could not be retired"
  rm -f \
    "$completed_dir/branch" \
    "$completed_dir/start-head" \
    "$completed_dir/target" \
    "$completed_dir/incoming" \
    "$completed_dir/form" \
    "$completed_dir/outcome" \
    "$completed_dir/phase" \
    "$completed_dir/stash" \
    "$completed_dir/saved-ref" \
    "$completed_dir"/.branch-* \
    "$completed_dir"/.start-head-* \
    "$completed_dir"/.target-* \
    "$completed_dir"/.incoming-* \
    "$completed_dir"/.form-* \
    "$completed_dir"/.outcome-* \
    "$completed_dir"/.phase-* \
    "$completed_dir"/.stash-* \
    "$completed_dir"/.saved-ref-*
  if ! rmdir "$completed_dir" 2>/dev/null; then
    leftover_dir="$state_dir-leftovers-$$"
    leftover_number=0
    while [ -e "$leftover_dir" ]; do
      leftover_number=$((leftover_number + 1))
      leftover_dir="$state_dir-leftovers-$$-$leftover_number"
    done
    mv "$completed_dir" "$leftover_dir" \
      || fail "unexpected run-state entries could not be retained"
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
    || non_merge_operation_in_progress
}

fetch_target() {
  tracking_ref=refs/remotes/origin/main
  tracking_before=$(git rev-parse --verify --quiet "$tracking_ref" || true)
  fetch_ref_base="refs/remdo-merge-main/fetch-$$"
  fetch_ref=$fetch_ref_base
  fetch_number=0
  while git rev-parse --verify --quiet "$fetch_ref" >/dev/null; do
    fetch_number=$((fetch_number + 1))
    fetch_ref="$fetch_ref_base-$fetch_number"
  done

  if ! git fetch --quiet --no-tags origin "refs/heads/main:$fetch_ref"; then
    git update-ref -d "$fetch_ref" 2>/dev/null || true
    fail "could not fetch origin"
  fi
  run_target=$(git rev-parse --verify --quiet "$fetch_ref^{commit}") \
    || fail "origin/main not found after fetch"
  if [ -n "$tracking_before" ]; then
    if ! git update-ref "$tracking_ref" "$run_target" "$tracking_before" \
      2>/dev/null; then
      tracking_current=$(git rev-parse --verify --quiet "$tracking_ref" || true)
      if [ "$tracking_current" != "$run_target" ]; then
        git update-ref -d "$fetch_ref" "$run_target" 2>/dev/null || true
        fail "origin/main changed during fetch"
      fi
    fi
  else
    if ! git update-ref "$tracking_ref" "$run_target" "" 2>/dev/null; then
      tracking_current=$(git rev-parse --verify --quiet "$tracking_ref" || true)
      if [ "$tracking_current" != "$run_target" ]; then
        git update-ref -d "$fetch_ref" "$run_target" 2>/dev/null || true
        fail "origin/main changed during fetch"
      fi
    fi
  fi
  git update-ref -d "$fetch_ref" "$run_target" \
    || fail "fetched target ref could not be removed"
}

non_merge_operation_in_progress() {
  [ -e "$(git rev-parse --git-path CHERRY_PICK_HEAD)" ] \
    || [ -e "$(git rev-parse --git-path REVERT_HEAD)" ] \
    || [ -e "$(git rev-parse --git-path BISECT_LOG)" ] \
    || [ -d "$(git rev-parse --git-path rebase-apply)" ] \
    || [ -d "$(git rev-parse --git-path rebase-merge)" ] \
    || [ -d "$(git rev-parse --git-path sequencer)" ]
}

require_integration_ancestry() {
  git merge-base --is-ancestor "$run_target" HEAD \
    || fail "branch no longer contains the fixed target"
  git merge-base --is-ancestor "$run_start_head" HEAD \
    || fail "branch no longer contains its original head"
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
  initial_number=0
  while [ -e "$initial_dir" ]; do
    initial_number=$((initial_number + 1))
    initial_dir="$state_dir-initial-$$-$initial_number"
  done
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
  if ! mv -T "$initial_dir" "$state_dir"; then
    rm -rf -- "$initial_dir"
    fail "another remdo-merge-main run started concurrently"
  fi
}

reserve_saved_ref() {
  worktree_id=$(printf '%s\n' \
    "$(git rev-parse --path-format=absolute --git-dir)" \
    | git hash-object --stdin)
  saved_ref_base="refs/remdo-merge-main/saved-$run_target-$worktree_id"
  saved_ref_suffix=
  saved_ref_number=0
  while :; do
    candidate="$saved_ref_base$saved_ref_suffix"
    if git rev-parse --verify --quiet "$candidate" >/dev/null; then
      saved_ref_number=$((saved_ref_number + 1))
      saved_ref_suffix="-$saved_ref_number"
      continue
    fi
    run_saved_ref=$candidate
    write_value saved-ref "$run_saved_ref"
    if git update-ref "$candidate" "$run_start_head" "" 2>/dev/null; then
      return
    fi
    git rev-parse --verify --quiet "$candidate" >/dev/null \
      || fail "saved-work identity could not be reserved"
    saved_ref_number=$((saved_ref_number + 1))
    saved_ref_suffix="-$saved_ref_number"
  done
}

prepare_private_stash() {
  private_stash_dir="$state_dir/private-stash"
  private_work_tree=$(git rev-parse --show-toplevel)
  private_index=$(git rev-parse --path-format=absolute --git-path index)
  private_objects=$(git rev-parse --path-format=absolute --git-path objects)
  private_config=$(git rev-parse --path-format=absolute --git-path config)
  private_info=$(git rev-parse --path-format=absolute --git-path info)
  private_ref_name="refs/remdo-merge-main/private-${run_saved_ref##*/}/stash"
  private_refs_dir=$(git rev-parse --path-format=absolute \
    --git-path "${private_ref_name%/stash}")
  mkdir -p "$private_stash_dir/objects" "$private_refs_dir"
  if [ ! -e "$private_stash_dir/refs" ]; then
    ln -s "$private_refs_dir" "$private_stash_dir/refs"
  fi
  if [ ! -e "$private_stash_dir/config" ]; then
    ln -s "$private_config" "$private_stash_dir/config"
  fi
  if [ ! -e "$private_stash_dir/info" ]; then
    ln -s "$private_info" "$private_stash_dir/info"
  fi
  if [ ! -f "$private_stash_dir/HEAD" ]; then
    printf '%s\n' "$run_start_head" >"$private_stash_dir/HEAD"
  fi
}

private_stash_git() {
  GIT_DIR="$private_stash_dir" \
  GIT_WORK_TREE="$private_work_tree" \
  GIT_INDEX_FILE="$private_index" \
  GIT_OBJECT_DIRECTORY="$private_objects" \
    git "$@"
}

remove_private_stash() {
  private_ref_name="refs/remdo-merge-main/private-${run_saved_ref##*/}/stash"
  private_refs_dir=$(git rev-parse --path-format=absolute \
    --git-path "${private_ref_name%/stash}")
  private_value=$(git rev-parse --verify --quiet "$private_ref_name" || true)
  if [ -n "$private_value" ]; then
    git update-ref -d "$private_ref_name" "$private_value" \
      || fail "private saved-work ref could not be removed"
  fi
  [ ! -e "$state_dir/private-stash" ] \
    || rm -rf -- "$state_dir/private-stash"
  rmdir "$private_refs_dir" 2>/dev/null || true
}

integrate_target() {
  write_value phase merging
  run_phase=merging
  case "$run_form" in
    up-to-date)
      restore_saved_work up-to-date
      ;;
    fast-forward)
      if GIT_CONFIG_COUNT=1 \
        GIT_CONFIG_KEY_0="branch.$run_branch.mergeOptions" \
        GIT_CONFIG_VALUE_0='' \
          git merge --quiet --ff-only "$run_target" \
        && git merge-base --is-ancestor "$run_target" HEAD \
        && git merge-base --is-ancestor "$run_start_head" HEAD \
        && ! operation_in_progress \
        && [ -z "$(git status --porcelain --untracked-files=normal)" ]; then
        restore_saved_work fast-forwarded
      else
        restore_saved_work stopped
        return 1
      fi
      ;;
    merge-commit)
      GIT_CONFIG_COUNT=1 \
      GIT_CONFIG_KEY_0="branch.$run_branch.mergeOptions" \
      GIT_CONFIG_VALUE_0='' \
        git merge --quiet --commit --no-edit --no-ff --no-squash \
        "$run_target" >/dev/null \
        || true
      if git merge-base --is-ancestor "$run_target" HEAD \
        && git merge-base --is-ancestor "$run_start_head" HEAD \
        && ! operation_in_progress; then
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
  if [ -z "$run_saved_ref" ]; then
    reserve_saved_ref
  fi
  current_saved=$(git rev-parse --verify --quiet "$run_saved_ref" || true)
  if [ -z "$current_saved" ]; then
    git update-ref "$run_saved_ref" "$run_start_head" "" \
      || fail "saved-work identity could not be reserved"
    current_saved=$run_start_head
  fi
  [ -n "$current_saved" ] \
    || fail "saved-work identity is missing"
  stash_status=0
  if [ -z "$run_stash" ]; then
    [ "$current_saved" = "$run_start_head" ] \
      || fail "saved-work identity belongs to another run"
    prepare_private_stash
    private_saved=$(private_stash_git rev-parse --verify --quiet refs/stash || true)
    if [ -z "$private_saved" ]; then
      set +e
      private_stash_git stash push --quiet --include-untracked \
        --message remdo-merge-main
      stash_status=$?
      set -e
      private_saved=$(
        private_stash_git rev-parse --verify --quiet refs/stash || true
      )
    else
      stash_status=0
    fi
    if [ -z "$private_saved" ]; then
      remove_private_stash
      echo "merge-main: local work could not be preserved" >&2
      restore_saved_work stopped
      return 1
    fi
    run_stash=$private_saved
    write_value stash "$run_stash"
  elif [ "$current_saved" != "$run_start_head" ] \
    && [ "$current_saved" != "$run_stash" ]; then
    fail "saved-work identity does not match preserved work"
  fi

  if [ "$current_saved" = "$run_start_head" ]; then
    git update-ref "$run_saved_ref" "$run_stash" "$run_start_head" \
      || fail "preserved work could not be journaled"
  fi
  remove_private_stash
  if [ "$stash_status" -ne 0 ]; then
    echo "merge-main: local work was saved but cleanup failed" >&2
    restore_saved_work stopped
    return 1
  fi
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
  has_unmerged_paths \
    && fail "working tree has unresolved paths"

  fetch_target
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

  if [ "$preserve" = yes ] && [ -n "$dirty" ]; then
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
  if [ "$preserve" = yes ] && [ -n "$dirty" ]; then
    run_phase=preserving
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
      operation_in_progress \
        && fail "another Git operation is already in progress"
      [ "$(git rev-parse --verify HEAD)" = "$run_start_head" ] \
        || fail "branch changed before preservation completed"
      preserve_and_integrate
      return
      ;;
    prepared)
      operation_in_progress \
        && fail "another Git operation is already in progress"
      [ "$(git rev-parse --verify HEAD)" = "$run_start_head" ] \
        || fail "branch changed before integration"
      if [ -n "$(git status --porcelain --untracked-files=normal)" ]; then
        if [ "$run_form" = fast-forward ] \
          && git diff --quiet \
          && git diff --cached --quiet "$run_target" \
          && [ -z "$(git ls-files --others --exclude-standard -- ':/')" ]; then
          git update-ref HEAD "$run_target" "$run_start_head" \
            || fail "interrupted fast-forward could not be completed"
          restore_saved_work fast-forwarded
          return
        fi
        fail "integration state is not clean"
      fi
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
      non_merge_operation_in_progress \
        && fail "another Git operation is already in progress"
      merge_head_path=$(git rev-parse --git-path MERGE_HEAD)
      if [ -e "$merge_head_path" ]; then
        merge_head=$(git rev-parse --verify MERGE_HEAD)
        [ "$merge_head" = "$run_target" ] \
          || fail "merge operation does not belong to this run"
      fi
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
    [ -z "$(git ls-files --others --exclude-standard -- ':/')" ] \
      || fail "untracked merge-resolution files remain"
    git commit --quiet --no-edit
  fi

  require_integration_ancestry
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
  require_integration_ancestry
  [ -z "$(git status --porcelain --untracked-files=normal)" ] \
    || fail "integration state is not clean and committed"
  if [ "$verification_failed" = yes ]; then
    run_outcome=verification-failed
    write_value outcome "$run_outcome"
  fi
  restore_saved_work "$run_outcome"
}

complete_restore() {
  resolved=no
  case "${1-}" in
    "")
      ;;
    --resolved)
      resolved=yes
      ;;
    *)
      fail "usage: merge-main.sh complete-restore [--resolved]"
      ;;
  esac
  [ "$#" -le 1 ] \
    || fail "usage: merge-main.sh complete-restore [--resolved]"
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
  if [ "$run_phase" = restore-applied ]; then
    [ "$resolved" = no ] \
      || fail "--resolved requires a conflicted or uncertain restoration"
  else
    [ "$resolved" = yes ] \
      || fail "conflicted or uncertain restoration requires --resolved"
  fi
  has_unmerged_paths \
    && fail "restoration still has unmerged paths"
  operation_in_progress \
    && fail "a Git operation is still in progress"
  [ "$run_outcome" = stopped ] \
    || require_integration_ancestry
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
    shift
    complete_restore "$@"
    ;;
  *)
    fail "usage: merge-main.sh <status|start|continue|finish|complete-restore>"
    ;;
esac
