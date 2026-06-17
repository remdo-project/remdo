#!/usr/bin/env sh

# Update every Node pin to the latest LTS, in lockstep — the same set the repo's
# pin-policy check (tools/check-pnpm-policy.ts, run as `audit:policy`) enforces:
#   - package.json   engines.node                       ->  <major>.<minor>.x
#   - pnpm-workspace.yaml  nodeVersion                   ->  <major>.<minor>.<patch>
#   - docker/Dockerfile    FROM node:…                   ->  node:<major>.<minor>-alpine
#   - .github/actions/setup-pnpm/action.yml node-version ->  <major>.<minor>.x
#
# Idempotent: a no-op when already current. Each field is matched by its own
# anchor (not a shared, possibly-stale major) and the write is verified, so a
# format drift fails loudly instead of silently editing the wrong/no field.
# `audit:policy` independently re-checks lockstep in the loop.

set -eu

# Resolve the repo root from this script's own location (three parents up — see
# next-update.sh), immune to a polluted GIT_WORK_TREE and needing no git.
SCRIPT_DIR="$(CDPATH='' cd -- "$(dirname -- "$0")" && pwd)"
ROOT_DIR="$(CDPATH='' cd -- "${SCRIPT_DIR}/../../.." && pwd)"
PKG_JSON="${ROOT_DIR}/package.json"
WORKSPACE_YAML="${ROOT_DIR}/pnpm-workspace.yaml"
DOCKERFILE="${ROOT_DIR}/docker/Dockerfile"
SETUP_PNPM="${ROOT_DIR}/.github/actions/setup-pnpm/action.yml"

# shellcheck source=.agents/skills/remdo-deps-refresh/edit-verified.sh
. "${SCRIPT_DIR}/edit-verified.sh"

current="$(sed -n 's/^nodeVersion: \([0-9][0-9.]*\)/\1/p' "${WORKSPACE_YAML}")"
[ -n "${current}" ] || { echo "bump-node-pins: no nodeVersion in ${WORKSPACE_YAML}." >&2; exit 1; }

# Latest Node LTS, full version, from the official dist index (newest LTS entry).
latest="$(curl -fsS https://nodejs.org/dist/index.json \
  | node -e 'const d=JSON.parse(require("fs").readFileSync(0,"utf8"));const l=d.find(r=>r.lts);process.stdout.write(l?l.version.replace(/^v/,""):"")')"
case "${latest}" in
  [0-9]*.[0-9]*.[0-9]*) : ;;
  *) echo "bump-node-pins: could not resolve a latest LTS Node version (got '${latest}')." >&2; exit 1 ;;
esac

minor="${latest%.*}"   # 24.16.0 -> 24.16

# Apply every pin unconditionally — edit_verified only writes when a file is not
# already in the desired state, so this both bumps and REPAIRS partial drift (a
# pin left behind by a bad merge or interrupted run), and is a clean no-op when
# all four already match. Gating only on nodeVersion would skip repairing the
# others, leaving the loop's audit:policy guard failing forever.

# engines.node: replace the value regardless of its current major/minor.
edit_verified "${PKG_JSON}" \
  "s|\"node\": \"[0-9][0-9.]*\.x\"|\"node\": \"${minor}.x\"|" \
  "\"node\": \"${minor}.x\""

# nodeVersion: anchored line, full version.
edit_verified "${WORKSPACE_YAML}" \
  "s|^nodeVersion: [0-9][0-9.]*|nodeVersion: ${latest}|" \
  "nodeVersion: ${latest}"

# Dockerfile: every FROM node:<x>-alpine base.
edit_verified "${DOCKERFILE}" \
  "s|node:[0-9][0-9.]*-alpine|node:${minor}-alpine|g" \
  "node:${minor}-alpine"

# setup-pnpm composite action: the CI node-version (same MAJOR.MINOR.x form).
edit_verified "${SETUP_PNPM}" \
  "s|node-version: [0-9][0-9.]*\.x|node-version: ${minor}.x|" \
  "node-version: ${minor}.x"

if [ "${current}" != "${latest}" ]; then
  echo "bump-node-pins: node ${current} -> ${latest}"
fi
