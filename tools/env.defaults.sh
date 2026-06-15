#!/usr/bin/env sh
# Shared env defaults/derivations. Source from scripts; do not exec directly.

: "${REMDO_ROOT:?Set REMDO_ROOT to the repo root before sourcing env.defaults.sh}"

: "${NODE_ENV:=development}"
: "${HOST:=localhost}"
: "${PORT_BASE:=4000}"
: "${PORT:=$((PORT_BASE + 0))}"
: "${COLLAB_ENABLED:=true}"
: "${DEV_DOCUMENT_ID:=devDoc}"
: "${CI:=false}"
: "${VITEST_PREVIEW:=false}"
: "${TMPDIR:=${REMDO_ROOT%/}/node_modules/.cache/vitest-tmp}" # Keep Vitest temp files out of repo root and shared with vitest-preview.
: "${DATA_DIR:=${REMDO_ROOT%/}/data}"

# Derive service/tool ports directly from PORT_BASE to keep local runs predictable.
: "${HMR_PORT:=$((PORT_BASE + 1))}"
: "${VITEST_PORT:=$((PORT_BASE + 2))}"
: "${VITEST_PREVIEW_PORT:=$((PORT_BASE + 3))}"
: "${COLLAB_SERVER_PORT:=$((PORT_BASE + 4))}"
: "${PREVIEW_PORT:=$((PORT_BASE + 5))}"
: "${PLAYWRIGHT_UI_PORT:=$((PORT_BASE + 6))}"
: "${API_SERVER_PORT:=$((PORT_BASE + 11))}"
: "${YSWEET_CONNECTION_STRING:=ys://127.0.0.1:${COLLAB_SERVER_PORT}}"

if [ -z "${AUTH_SECRET:-}" ] && [ "${NODE_ENV}" != "production" ]; then
  AUTH_SECRET="development-auth-secret-0123456789"
fi
if [ -z "${ADMIN_SECRET:-}" ] && [ "${NODE_ENV}" != "production" ]; then
  ADMIN_SECRET="development-admin-secret-0123456789"
fi
if [ -z "${YSWEET_AUTH_KEY:-}" ] && [ "${NODE_ENV}" != "production" ]; then
  YSWEET_AUTH_KEY="WLo8wx1G1lGKpIDaDjky9npTrV_fW8jCpRVtB8rd"
fi
if [ -z "${YSWEET_SERVER_TOKEN:-}" ] && [ "${NODE_ENV}" != "production" ]; then
  YSWEET_SERVER_TOKEN="AAAgOkIiPro6W2lCzxyW6BDQkuOmTVSfs0MZh-4PGTM_st0"
fi

: "${REMDO_DEV_OAUTH_CLIENT_ID:=remdo-home-dev}"
: "${REMDO_DEV_OAUTH_CLIENT_SECRET:=remdo-dev-client-secret-0123456789}"
remdo_dev_default_origin="http://localhost:${PORT}"
: "${REMDO_DEV_HOME_ORIGIN:=${remdo_dev_default_origin}}"
if [ "${NODE_ENV}" = "development" ] && [ -z "${AUTH_URL+x}" ]; then
  AUTH_URL="${remdo_dev_default_origin}"
fi

case "${NODE_ENV}" in
  production)
    : "${ALLOW_SIGNUP:=false}"
    ;;
  *)
    : "${ALLOW_SIGNUP:=true}"
    ;;
esac

# Chromium refuses to connect to these ports (ERR_UNSAFE_PORT). Exposed as a
# function so callers that resolve the public port later (e.g. the prod launcher
# validating its independent listen PORT) can re-validate it.
# Variables are _rbsp_-prefixed because POSIX sh has no `local`; this avoids
# leaking them into the global scope of every script that sources this file.
remdo_assert_browser_safe_port() {
  _rbsp_port="$1"
  _rbsp_restricted_ports="0 1 7 9 11 13 15 17 19 20 21 22 23 25 37 42 43 53 69 77 79 87 95 \
101 102 103 104 109 110 111 113 115 117 119 123 135 137 139 143 161 179 389 427 \
465 512 513 514 515 526 530 531 532 540 548 554 556 563 587 601 636 989 990 993 \
995 1719 1720 1723 2049 3659 4045 5060 5061 6000 6566 6665 6666 6667 6668 6669 \
6697 10080"
  for _rbsp_restricted_port in ${_rbsp_restricted_ports}; do
    if [ "${_rbsp_port}" = "${_rbsp_restricted_port}" ]; then
      echo "Port ${_rbsp_port} is blocked by Chromium (ERR_UNSAFE_PORT). Pick a different PORT or PORT_BASE." >&2
      exit 1
    fi
  done
}

# The public PORT is browser-facing in every mode, so always validate it.
remdo_assert_browser_safe_port "${PORT}"

# In dev/test there is no Caddy in front: the browser connects directly to the
# Vite/HMR/preview/Playwright servers and (for collaboration) to the collab and
# API servers, so each derived port must be browser-safe too. The prod container
# routes everything through Caddy, so only PORT above is browser-facing there.
if [ "${NODE_ENV}" != "production" ]; then
  for derived_port in \
    "${HMR_PORT}" \
    "${VITEST_PORT}" \
    "${VITEST_PREVIEW_PORT}" \
    "${COLLAB_SERVER_PORT}" \
    "${PREVIEW_PORT}" \
    "${PLAYWRIGHT_UI_PORT}" \
    "${API_SERVER_PORT}"
  do
    remdo_assert_browser_safe_port "${derived_port}"
  done
fi

export NODE_ENV HOST PORT_BASE PORT DATA_DIR COLLAB_ENABLED DEV_DOCUMENT_ID CI VITEST_PREVIEW TMPDIR
export HMR_PORT VITEST_PORT VITEST_PREVIEW_PORT COLLAB_SERVER_PORT API_SERVER_PORT YSWEET_CONNECTION_STRING
export PREVIEW_PORT PLAYWRIGHT_UI_PORT
export AUTH_SECRET ADMIN_SECRET YSWEET_AUTH_KEY YSWEET_SERVER_TOKEN APP_PUBLIC_URL AUTH_URL ALLOW_SIGNUP
export LINKABLE_REMDO_SERVERS_JSON REMDO_DEV_HOME_ORIGIN
export REMDO_DEV_OAUTH_CLIENT_ID REMDO_DEV_OAUTH_CLIENT_SECRET
