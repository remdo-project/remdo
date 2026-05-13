#!/usr/bin/env sh
# Shared env defaults/derivations. Source from scripts; do not exec directly.

: "${REMDO_ROOT:?Set REMDO_ROOT to the repo root before sourcing env.defaults.sh}"

: "${NODE_ENV:=development}"
: "${HOST:=127.0.0.1}"
: "${PORT:=4000}"
: "${COLLAB_ENABLED:=true}"
: "${COLLAB_DOCUMENT_ID:=main}"
: "${CI:=false}"
: "${VITEST_PREVIEW:=false}"
: "${TMPDIR:=${REMDO_ROOT%/}/node_modules/.cache/vitest-tmp}" # Keep Vitest temp files out of repo root and shared with vitest-preview.
DATA_DIR="${REMDO_ROOT%/}/data"

# Derive all service/tool ports from the base PORT to keep multi-workdir runs predictable.
: "${HMR_PORT:=$((PORT + 1))}"
: "${VITEST_PORT:=$((PORT + 2))}"
: "${VITEST_PREVIEW_PORT:=$((PORT + 3))}"
: "${COLLAB_SERVER_PORT:=$((PORT + 4))}"
: "${COLLAB_CLIENT_PORT:=${COLLAB_SERVER_PORT}}"
: "${PREVIEW_PORT:=$((PORT + 5))}"
: "${PLAYWRIGHT_UI_PORT:=$((PORT + 6))}"
: "${DOCKER_TEST_PORT:=$((PORT + 7))}"
: "${PLAYWRIGHT_WEB_PORT:=$((PORT + 9))}"
: "${PLAYWRIGHT_HMR_PORT:=$((PORT + 10))}"
: "${REMDO_API_PORT:=$((PORT + 11))}"
: "${YSWEET_CONNECTION_STRING:=ys://127.0.0.1:${COLLAB_SERVER_PORT}}"

# E2E uses a separate declared port family so it can run while the normal dev
# stack is active on PORT/COLLAB_SERVER_PORT/REMDO_API_PORT.
: "${E2E_PORT:=${PLAYWRIGHT_WEB_PORT}}"
: "${E2E_HMR_PORT:=${PLAYWRIGHT_HMR_PORT}}"
: "${E2E_COLLAB_SERVER_PORT:=$((E2E_PORT + 4))}"
: "${E2E_COLLAB_CLIENT_PORT:=${E2E_COLLAB_SERVER_PORT}}"
: "${E2E_REMDO_API_PORT:=$((E2E_PORT + 11))}"
: "${E2E_YSWEET_CONNECTION_STRING:=ys://127.0.0.1:${E2E_COLLAB_SERVER_PORT}}"

if [ -z "${AUTH_SECRET:-}" ] && [ "${NODE_ENV}" != "production" ]; then
  AUTH_SECRET="development-auth-secret-0123456789"
fi
if [ -z "${ADMIN_SECRET:-}" ] && [ "${NODE_ENV}" != "production" ]; then
  ADMIN_SECRET="development-admin-secret-0123456789"
fi

case "${NODE_ENV}" in
  production)
    : "${ALLOW_SIGNUP:=false}"
    ;;
  *)
    : "${ALLOW_SIGNUP:=true}"
    ;;
esac

# Chromium blocks these ports; fail fast if base or derived ports land on one.
restricted_ports="0 1 7 9 11 13 15 17 19 20 21 22 23 25 37 42 43 53 69 77 79 87 95 \
101 102 103 104 109 110 111 113 115 117 119 123 135 137 139 143 161 179 389 427 \
465 512 513 514 515 526 530 531 532 540 548 554 556 563 587 601 636 989 990 993 \
995 1719 1720 1723 2049 3659 4045 5060 5061 6000 6566 6665 6666 6667 6668 6669 \
6697 10080"

for derived_port in \
  "${PORT}" \
  "${HMR_PORT}" \
  "${VITEST_PORT}" \
  "${VITEST_PREVIEW_PORT}" \
  "${COLLAB_SERVER_PORT}" \
  "${COLLAB_CLIENT_PORT}" \
  "${PREVIEW_PORT}" \
  "${PLAYWRIGHT_UI_PORT}" \
  "${DOCKER_TEST_PORT}" \
  "${PLAYWRIGHT_WEB_PORT}" \
  "${PLAYWRIGHT_HMR_PORT}" \
  "${REMDO_API_PORT}" \
  "${E2E_PORT}" \
  "${E2E_HMR_PORT}" \
  "${E2E_COLLAB_SERVER_PORT}" \
  "${E2E_COLLAB_CLIENT_PORT}" \
  "${E2E_REMDO_API_PORT}"
do
  for restricted_port in ${restricted_ports}; do
    if [ "${derived_port}" = "${restricted_port}" ]; then
      echo "Port ${derived_port} is blocked by Chromium. Pick a different PORT base." >&2
      exit 1
    fi
  done
done

export NODE_ENV HOST PORT DATA_DIR COLLAB_ENABLED COLLAB_DOCUMENT_ID CI VITEST_PREVIEW TMPDIR
export HMR_PORT VITEST_PORT VITEST_PREVIEW_PORT COLLAB_SERVER_PORT REMDO_API_PORT YSWEET_CONNECTION_STRING
export COLLAB_CLIENT_PORT PREVIEW_PORT PLAYWRIGHT_UI_PORT DOCKER_TEST_PORT PLAYWRIGHT_WEB_PORT PLAYWRIGHT_HMR_PORT
export E2E_PORT E2E_HMR_PORT E2E_COLLAB_SERVER_PORT E2E_COLLAB_CLIENT_PORT E2E_REMDO_API_PORT
export E2E_YSWEET_CONNECTION_STRING
export AUTH_SECRET ADMIN_SECRET APP_PUBLIC_URL ALLOW_SIGNUP
