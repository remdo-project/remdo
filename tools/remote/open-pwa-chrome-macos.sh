#!/usr/bin/env bash
set -euo pipefail

# Launches a throwaway macOS Chrome app window for testing dev:pwa from a host
# machine against a dev server running elsewhere.

TARGET="${1:?Usage: open-pwa-chrome-macos.sh host:port}"
case "${TARGET}" in
  *://*|*/*|"")
    echo "Expected host:port, received: ${TARGET}" >&2
    exit 1
    ;;
esac

case "$(uname -s)" in
  Darwin)
    ;;
  *)
    echo "This helper requires macOS." >&2
    exit 1
    ;;
esac

CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
if [[ ! -x "${CHROME}" ]]; then
  echo "Google Chrome not found at: ${CHROME}" >&2
  exit 1
fi

ORIGIN="http://${TARGET}"
APP_URL="${ORIGIN}/api/dev/login"
PROFILE_DIR="$(mktemp -d -t remdo-pwa-chrome.XXXXXX)"

echo "Opening ${APP_URL}"
echo "Chrome profile: ${PROFILE_DIR}"

"${CHROME}" \
  --user-data-dir="${PROFILE_DIR}" \
  --no-first-run \
  --no-default-browser-check \
  --unsafely-treat-insecure-origin-as-secure="${ORIGIN}" \
  --app="${APP_URL}" \
  >/dev/null 2>&1 &
