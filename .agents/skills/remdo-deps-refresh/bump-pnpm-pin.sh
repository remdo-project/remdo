#!/usr/bin/env sh

# Update package.json's "packageManager" pnpm pin to the latest release, with the
# exact corepack integrity hash. Idempotent: a no-op when already current.
#
# The hash MUST be exact (a wrong digest silently breaks every corepack install),
# so it is derived deterministically from the npm tarball digest here rather than
# typed or eyeballed. This is the one piece the loop keeps as a script for that
# reason; everything else about the pin is a plain field edit.

set -eu

# Resolve the repo root from this script's own location (three parents up — see
# next-update.sh), immune to a polluted GIT_WORK_TREE and needing no git.
SCRIPT_DIR="$(CDPATH='' cd -- "$(dirname -- "$0")" && pwd)"
ROOT_DIR="$(CDPATH='' cd -- "${SCRIPT_DIR}/../../.." && pwd)"
PKG_JSON="${ROOT_DIR}/package.json"

# shellcheck source=.agents/skills/remdo-deps-refresh/edit-verified.sh
. "${SCRIPT_DIR}/edit-verified.sh"

current="$(sed -n 's/.*"packageManager": "pnpm@\([0-9][0-9.]*\).*/\1/p' "${PKG_JSON}")"
latest="$(npm view pnpm version)"

[ -n "${current}" ] || { echo "bump-pnpm-pin: no pnpm packageManager pin found in ${PKG_JSON}." >&2; exit 1; }
[ -n "${latest}" ] || { echo "bump-pnpm-pin: could not resolve latest pnpm version." >&2; exit 1; }
[ "${current}" != "${latest}" ] || exit 0   # already current

# npm dist.integrity is base64 sha512; corepack wants the same digest in hex.
# `od -v` disables the `*` run-compression that would otherwise corrupt a digest
# containing repeated 16-byte rows. A clean sha512 hex is exactly 128 chars.
hex="$(npm view "pnpm@${latest}" dist.integrity | sed 's/^sha512-//' | base64 -d | od -v -An -tx1 | tr -d ' \n')"
case "${hex}" in
  *[!0-9a-f]* | "") echo "bump-pnpm-pin: failed to derive a clean hex integrity for pnpm@${latest}." >&2; exit 1 ;;
esac
[ "${#hex}" -eq 128 ] || { echo "bump-pnpm-pin: integrity for pnpm@${latest} is ${#hex} hex chars, expected 128." >&2; exit 1; }

# Match the whole packageManager line by its key, not by the old version, so the
# edit cannot silently no-op on a reformatted value, and verify it landed.
edit_verified "${PKG_JSON}" \
  "s|\"packageManager\": \"pnpm@[^\"]*\"|\"packageManager\": \"pnpm@${latest}+sha512.${hex}\"|" \
  "pnpm@${latest}+sha512.${hex}"

echo "bump-pnpm-pin: pnpm ${current} -> ${latest}"
