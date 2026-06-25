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

# Resolve to the newest LTS version whose `node:<minor>-alpine` Docker base is
# ALSO published — the Dockerfile FROM tags lag the nodejs.org release by a few
# days, so the plain "latest LTS" can point at a base image that does not exist
# yet (e.g. 24.18.0 released while only node:24.17-alpine is on Docker Hub),
# which fails the docker e2e build. We walk the newest LTS major's minors
# newest-first and pick the first whose alpine tag resolves; the held-back
# fresher minor upgrades automatically once its image publishes. All four pins
# use that one version.
#
# Two guards keep a transient failure from silently mis-resolving:
#   - The Docker Hub check distinguishes 404 ("image absent" — keep walking) from
#     any other outcome (429/5xx/000 network error — abort), so "couldn't check"
#     never reads as "doesn't exist" and demotes the pin to a stale minor.
#   - The walk is bounded to the newest LTS major; an entry from any other major
#     is skipped, never pinned (that would silently downgrade). The index is
#     date-sorted, so an older major's patch can interleave between two newest-
#     major minors — we must skip those entries, not stop at them, or we'd abort
#     before reaching a published older minor of the newest major. If no minor of
#     the newest major has an image yet, we abort rather than cross majors.
lts_versions="$(curl -fsS https://nodejs.org/dist/index.json \
  | node -e 'const d=JSON.parse(require("fs").readFileSync(0,"utf8"));process.stdout.write(d.filter(r=>r.lts).map(r=>r.version.replace(/^v/,"")).join("\n"))')"
[ -n "${lts_versions}" ] || { echo "bump-node-pins: could not fetch the Node LTS list from nodejs.org/dist." >&2; exit 1; }

# Newest LTS major = the major of the first (newest-by-date) valid entry.
newest_major=""
for v in ${lts_versions}; do
  case "${v}" in [0-9]*.[0-9]*.[0-9]*) newest_major="${v%%.*}"; break ;; esac
done
[ -n "${newest_major}" ] || { echo "bump-node-pins: no valid LTS version in the Node dist index." >&2; exit 1; }

latest=""
for v in ${lts_versions}; do
  case "${v}" in
    [0-9]*.[0-9]*.[0-9]*) : ;;
    *) continue ;;
  esac
  # Only consider the newest major; skip interleaved older-major releases.
  [ "${v%%.*}" = "${newest_major}" ] || continue

  m="${v%.*}"
  # GET the Docker Hub tag for node:<minor>-alpine and branch on the status.
  status="$(curl -fsSL -o /dev/null -w '%{http_code}' \
    "https://hub.docker.com/v2/repositories/library/node/tags/${m}-alpine" 2>/dev/null || true)"
  case "${status}" in
    200) latest="${v}"; break ;;
    404) continue ;;  # image not published yet — try the next-older minor
    *) echo "bump-node-pins: Docker Hub tag check for node:${m}-alpine failed (HTTP '${status}'); aborting rather than mis-resolving the pin." >&2; exit 1 ;;
  esac
done
[ -n "${latest}" ] || { echo "bump-node-pins: no published node:<minor>-alpine image for the newest LTS major (${newest_major}.x) yet; not crossing to an older major." >&2; exit 1; }

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
