#!/usr/bin/env sh

# Bump GitHub Actions pinned to a floating major tag (`uses: owner/repo@vN`) to
# the latest release major across .github/**. Minors/patches already float via
# the major tag, so only the major moves. Idempotent: a no-op when all current.
#
# Bumps ONLY bare `@vN` pins (the project's convention). A more specific pin like
# `@vN.M.K` is left alone — bumping just its major would invent a nonexistent
# `@vN+1.M.K` tag. Requires `gh`.

set -eu

# Resolve the repo root from this script's own location (three parents up — see
# next-update.sh), immune to a polluted GIT_WORK_TREE and needing no git.
SCRIPT_DIR="$(CDPATH='' cd -- "$(dirname -- "$0")" && pwd)"
ROOT_DIR="$(CDPATH='' cd -- "${SCRIPT_DIR}/../../.." && pwd)"
GH_DIR="${ROOT_DIR}/.github"

command -v gh >/dev/null 2>&1 || { echo "bump-action-majors: gh not available; skipping." >&2; exit 0; }

# Distinct `owner/repo@vN` refs in use (bare major tag only: `@v<digits>` end of
# token). Excludes local `./…` composite refs and more-specific `@vN.M…` pins.
refs="$(grep -rhoE 'uses: [a-zA-Z0-9_.-]+/[a-zA-Z0-9_./-]+@v[0-9]+([^.0-9]|$)' "${GH_DIR}" 2>/dev/null \
  | sed -E 's/^uses: //; s/[^0-9]*$//' | sort -u)"

[ -n "${refs}" ] || exit 0

for ref in ${refs}; do
  repo="${ref%@*}"
  cur="${ref##*@v}"

  # Distinguish "genuinely no release" (HTTP 404 — a legitimate skip) from a real
  # failure (auth, rate-limit, network), so the latter aborts and surfaces in the
  # loop instead of silently skipping every action and reporting a green no-op.
  gh_err="$(mktemp)"
  if latest_tag="$(gh api "repos/${repo}/releases/latest" --jq '.tag_name' 2>"${gh_err}")"; then
    rm -f "${gh_err}"
  elif grep -q 'HTTP 404' "${gh_err}"; then
    rm -f "${gh_err}"
    echo "bump-action-majors: no latest release for ${repo}; skipping." >&2
    continue
  else
    echo "bump-action-majors: gh api failed for ${repo}:" >&2
    cat "${gh_err}" >&2
    rm -f "${gh_err}"
    exit 1
  fi
  [ -n "${latest_tag}" ] || { echo "bump-action-majors: empty tag for ${repo}; skipping." >&2; continue; }
  latest="$(printf '%s' "${latest_tag}" | sed -E 's/^v?([0-9]+).*/\1/')"
  case "${latest}" in ''|*[!0-9]*) continue ;; esac
  [ "${latest}" != "${cur}" ] || continue

  echo "bump-action-majors: ${repo} @v${cur} -> @v${latest}"
  # Rewrite only the exact bare `@v<cur>` token (followed by a non-version char or
  # end of line), never a `@v<cur>.x.y` pin. Use '#' as the sed/grep delimiter so
  # the '|' alternation inside the group does not collide with it.
  grep -rlE "uses: ${repo}@v${cur}([^0-9.]|\$)" "${GH_DIR}" 2>/dev/null | while IFS= read -r f; do
    sed -i.bak -E "s#(uses: ${repo})@v${cur}([^0-9.]|\$)#\\1@v${latest}\\2#g" "${f}"
    rm -f "${f}.bak"
  done
done
