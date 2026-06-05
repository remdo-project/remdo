#!/usr/bin/env sh
# Shared env defaults/derivations. Source from scripts; do not exec directly.

: "${REMDO_ROOT:?Set REMDO_ROOT to the repo root before sourcing env.defaults.sh}"

: "${NODE_ENV:=development}"
: "${HOST:=localhost}"
: "${PORT_BASE:=4000}"
: "${RUN_MODE_PORT_SHIFT:=0}"
requested_run_mode_port_shift="${RUN_MODE_PORT_SHIFT}"
unshifted_port_base="${PORT_BASE}"
run_mode_port_base=$((PORT_BASE + requested_run_mode_port_shift))
if [ "${requested_run_mode_port_shift}" != "0" ] && [ "${PORT:-}" = "${unshifted_port_base}" ]; then
  unset PORT
fi
RUN_MODE_PORT_SHIFT=0
: "${PORT:=$((run_mode_port_base + 0))}"
: "${COLLAB_ENABLED:=true}"
: "${DEV_DOCUMENT_ID:=devDoc}"
: "${CI:=false}"
: "${VITEST_PREVIEW:=false}"
: "${TMPDIR:=${REMDO_ROOT%/}/node_modules/.cache/vitest-tmp}" # Keep Vitest temp files out of repo root and shared with vitest-preview.
: "${DATA_DIR:=${REMDO_ROOT%/}/data}"

# Derive service/tool ports from the run-mode port base to keep local runs predictable.
: "${HMR_PORT:=$((run_mode_port_base + 1))}"
: "${VITEST_PORT:=$((run_mode_port_base + 2))}"
: "${VITEST_PREVIEW_PORT:=$((run_mode_port_base + 3))}"
: "${COLLAB_SERVER_PORT:=$((run_mode_port_base + 4))}"
: "${PREVIEW_PORT:=$((run_mode_port_base + 5))}"
: "${PLAYWRIGHT_UI_PORT:=$((run_mode_port_base + 6))}"
: "${API_SERVER_PORT:=$((run_mode_port_base + 11))}"
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

: "${REMDO_DEV_REMOTE_PORT_SHIFT:=30}"
: "${REMDO_DEV_OAUTH_CLIENT_ID:=remdo-home-dev}"
: "${REMDO_DEV_OAUTH_CLIENT_SECRET:=remdo-dev-client-secret-0123456789}"
remdo_dev_remote_port=$((PORT_BASE + REMDO_DEV_REMOTE_PORT_SHIFT))
: "${REMDO_DEV_HOME_ORIGIN:=http://localhost:${PORT}}"
: "${REMDO_DEV_REMOTE_ORIGIN:=http://127.0.0.1:${remdo_dev_remote_port}}"
if [ "${NODE_ENV}" = "development" ] && [ -z "${AUTH_URL+x}" ]; then
  if [ "${requested_run_mode_port_shift}" = "0" ]; then
    AUTH_URL="${REMDO_DEV_HOME_ORIGIN}"
  elif [ "${requested_run_mode_port_shift}" = "${REMDO_DEV_REMOTE_PORT_SHIFT}" ]; then
    AUTH_URL="${REMDO_DEV_REMOTE_ORIGIN}"
  fi
fi
if [ "${NODE_ENV}" = "development" ] \
  && [ "${requested_run_mode_port_shift}" = "0" ] \
  && [ -z "${LINKABLE_REMDO_SERVERS_JSON+x}" ]; then
  LINKABLE_REMDO_SERVERS_JSON='[{"id":"remote","label":"Remote dev server","baseUrl":"'"${REMDO_DEV_REMOTE_ORIGIN}"'","clientId":"'"${REMDO_DEV_OAUTH_CLIENT_ID}"'","clientSecret":"'"${REMDO_DEV_OAUTH_CLIENT_SECRET}"'"}]'
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
  "${PREVIEW_PORT}" \
  "${PLAYWRIGHT_UI_PORT}" \
  "${API_SERVER_PORT}"
do
  for restricted_port in ${restricted_ports}; do
    if [ "${derived_port}" = "${restricted_port}" ]; then
      echo "Port ${derived_port} is blocked by Chromium. Pick a different PORT_BASE." >&2
      exit 1
    fi
  done
done

export NODE_ENV HOST PORT_BASE RUN_MODE_PORT_SHIFT PORT DATA_DIR COLLAB_ENABLED DEV_DOCUMENT_ID CI VITEST_PREVIEW TMPDIR
export HMR_PORT VITEST_PORT VITEST_PREVIEW_PORT COLLAB_SERVER_PORT API_SERVER_PORT YSWEET_CONNECTION_STRING
export PREVIEW_PORT PLAYWRIGHT_UI_PORT
export AUTH_SECRET ADMIN_SECRET YSWEET_AUTH_KEY YSWEET_SERVER_TOKEN APP_PUBLIC_URL AUTH_URL ALLOW_SIGNUP
export LINKABLE_REMDO_SERVERS_JSON REMDO_DEV_HOME_ORIGIN REMDO_DEV_REMOTE_ORIGIN
export REMDO_DEV_REMOTE_PORT_SHIFT REMDO_DEV_OAUTH_CLIENT_ID REMDO_DEV_OAUTH_CLIENT_SECRET
