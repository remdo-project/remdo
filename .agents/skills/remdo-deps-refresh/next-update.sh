#!/usr/bin/env sh

# Walking gate for the dependency-refresh loop (see the remdo-deps-refresh skill).
#
# Runs a fixed, ordered list of update steps and STOPS at the first one that
# changes the repo, exiting non-zero so the skill can investigate that single
# change (review it, run the relevant tests, simplify, heal) before looping back.
# When every step is a no-op, exits 0: nothing left to update.
#
# Design: the script only DETECTS "did this step do work?" — it never parses
# versions or rewrites files itself. Each step is a small, single-purpose command
# (mostly other tools/scripts); "did work" = the step's target files changed,
# measured by a before/after digest so it is independent of unrelated uncommitted
# changes in the tree. All the fiddly, format-specific editing lives in the tiny
# per-tool helpers, not here, and all the non-deterministic judgement lives in the
# skill, not here.
#
# Exit codes:
#   0  every step was a no-op — the refresh is complete (green).
#   3  a step changed the repo — the skill should investigate this one change,
#      then run this script again.
#   other (1/2/…)  a step itself failed — a real error for the skill to debug.

set -eu

# Resolve paths from this script's own location (immune to a polluted
# GIT_WORK_TREE/GIT_DIR, and needs no git). This skill dir sits three levels
# below the repo root — at <root>/.agents/skills/remdo-deps-refresh, and likewise
# via the .claude symlink — so the root is three parents up.
SCRIPT_DIR="$(CDPATH='' cd -- "$(dirname -- "$0")" && pwd)"
ROOT_DIR="$(CDPATH='' cd -- "${SCRIPT_DIR}/../../.." && pwd)"
[ -f "${ROOT_DIR}/package.json" ] || { echo "next-update: repo root not found at ${ROOT_DIR}." >&2; exit 1; }
cd "${ROOT_DIR}"

CHANGED_EXIT=3

# digest_of <path...> : stable digest of the given paths' contents. Files are
# hashed directly; a directory is hashed recursively (every file under it), so a
# step can target a whole tree and match a helper that edits it recursively.
# Missing paths contribute nothing. Used to tell whether a step changed its
# targets.
digest_of() {
  # shellcheck disable=SC2068 # intentional word-split over the path list.
  find $@ -type f -exec cat {} + 2>/dev/null | md5sum | cut -d' ' -f1
}

# step <label> <targets-glob> <command...> : run the command; if its target files
# changed, announce and exit CHANGED_EXIT. Targets are passed to digest_of via the
# shell, so globs expand here.
step() {
  label="$1"
  targets="$2"
  shift 2

  # shellcheck disable=SC2086 # targets is a space-separated path/glob list.
  before="$(digest_of $targets)"
  "$@"
  # shellcheck disable=SC2086
  after="$(digest_of $targets)"

  if [ "${before}" != "${after}" ]; then
    echo "next-update: '${label}' changed the repo — hand to the skill, then re-run."
    exit "${CHANGED_EXIT}"
  fi
  echo "next-update: '${label}' no-op."
}

# Refresh the lockfile, then normalize pnpm-workspace.yaml. `pnpm update` rewrites
# the catalog in a compact, possibly-unsorted form that the repo's lint (CI=1
# eslint, yaml/sort-keys + blank-line style) rejects; without the fix the two
# fight forever and the step never reaches a no-op. `CI=1 eslint --fix` produces
# the lint-clean, stable form, so the step is idempotent and the loop converges.
lockfile_update() {
  pnpm update --latest --workspace-root
  CI=1 pnpm exec eslint --fix pnpm-workspace.yaml
}

# --- the ordered update list -------------------------------------------------
# One coherent item per step. The lockfile is a single item (its gate is the full
# suite). The out-of-lockfile pins are separate items so a break is isolated to
# one tool. The final guard runs the repo's own pin-policy check.

step "lockfile deps"   "pnpm-lock.yaml pnpm-workspace.yaml" \
  lockfile_update

step "pnpm pin"        "package.json" \
  sh "${SCRIPT_DIR}/bump-pnpm-pin.sh"

step "node pins"       "package.json pnpm-workspace.yaml docker/Dockerfile .github/actions/setup-pnpm/action.yml" \
  sh "${SCRIPT_DIR}/bump-node-pins.sh"

# Digest the whole .github tree (recursively) to match bump-action-majors's
# `grep -r` edit scope, so a ref in any nested workflow/action is still detected.
step "github actions"  ".github" \
  sh "${SCRIPT_DIR}/bump-action-majors.sh"

# Guard (no changes expected): the repo's pin-policy check enforces Node-pin
# lockstep across package.json / pnpm-workspace.yaml / Dockerfile / setup-pnpm,
# plus the other pnpm/catalog invariants. A real error (not CHANGED_EXIT) on drift.
pnpm run audit:policy

echo "next-update: nothing left to update."
