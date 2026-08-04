#!/usr/bin/env sh
# Serve the production-built frontend beside `pnpm run dev` on its +20 port.
set -eu

ROOT_DIR="$(CDPATH='' cd -- "$(dirname "$0")/../.." && pwd)"
PWA_PORT="$("${ROOT_DIR}/tools/env.sh" --port-base-offset 20 sh -c 'printf %s "${PORT}"')"
MAIN_GATEWAY="$("${ROOT_DIR}/tools/env.sh" pnpm exec tsx ./tools/dev/print-app-public-url.ts)"
export MAIN_GATEWAY PWA_PORT

# shellcheck disable=SC2016 # expanded after env.sh resolves the main development gateway.
exec "${ROOT_DIR}/tools/env.sh" sh -c '
  set -eu
  if ! curl -fsS "${MAIN_GATEWAY%/}/api/health" >/dev/null; then
    echo "PWA preview requires the main development gateway; run pnpm dev first." >&2
    exit 1
  fi
  pnpm run build
  exec concurrently --kill-others-on-fail --names build,preview \
    "pnpm run build:watch" \
    "pnpm exec vite preview --port ${PWA_PORT}"
'
