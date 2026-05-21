#!/usr/bin/env bash
set -euo pipefail

# Launches a throwaway macOS Chrome app window for testing dev:pwa from a host
# machine against a dev server running elsewhere.

TARGET="${1:?Usage: open-pwa-chrome-macos.sh host:port}"
[[ "${TARGET}" != *://* && "${TARGET}" != */* ]] || { echo "Expected host:port, received: ${TARGET}" >&2; exit 1; }

[[ "$(uname -s)" == "Darwin" ]] || { echo "This helper requires macOS." >&2; exit 1; }

CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
[[ -x "${CHROME}" ]] || { echo "Google Chrome not found at: ${CHROME}" >&2; exit 1; }

ORIGIN="http://${TARGET}"
PROFILE_DIR="$(mktemp -d -t remdo-pwa-chrome.XXXXXX)"

echo "Opening ${ORIGIN}"
echo "Chrome profile: ${PROFILE_DIR}"

"${CHROME}" \
  --user-data-dir="${PROFILE_DIR}" \
  --no-first-run \
  --no-default-browser-check \
  --unsafely-treat-insecure-origin-as-secure="${ORIGIN}" \
  --app="${ORIGIN}" \
  >/dev/null 2>&1 &
