#!/usr/bin/env sh
# Shared env defaults/derivations. Source from scripts; do not exec directly.

: "${REMDO_ROOT:?Set REMDO_ROOT to the repo root before sourcing env.defaults.sh}"

: "${NODE_ENV:=development}"
if [ "${NODE_ENV}" = "production" ]; then
  unset PORT_BASE PUBLIC_HOST VITEST_PORT PREVIEW_PORT
else
  : "${HOST:=localhost}"
  : "${PORT_BASE:=4000}"

  # Shift complete local stacks before deriving their ports.
  if [ -n "${_remdo_port_base_offset:-}" ]; then
    PORT_BASE="$((PORT_BASE + _remdo_port_base_offset))"
  fi

  PORT="$((PORT_BASE + 0))"
  # Offsets +7..+10 are intentionally reserved for the Docker E2E containers
  # (tools/docker-test.sh currently uses +7 through +10); do not assign them to
  # a derived service port here.
  VITEST_PORT="$((PORT_BASE + 2))"
  COLLAB_SERVER_PORT="$((PORT_BASE + 4))"
  API_SERVER_PORT="$((PORT_BASE + 11))"
  PREVIEW_PORT="$((PORT_BASE + 20))"
  YSWEET_CONNECTION_STRING="ys://127.0.0.1:${COLLAB_SERVER_PORT}"
fi
unset _remdo_port_base_offset

: "${COLLAB_ENABLED:=true}"
: "${DEV_DOCUMENT_ID:=devDoc}"
: "${CI:=false}"
: "${TMPDIR:=${REMDO_ROOT%/}/node_modules/.cache/vitest-tmp}" # Keep Vitest temp files out of the repo root.
: "${DATA_DIR:=${REMDO_ROOT%/}/data}"

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

case "${NODE_ENV}" in
  production)
    : "${ALLOW_SIGNUP:=false}"
    ;;
  *)
    : "${ALLOW_SIGNUP:=true}"
    ;;
esac

# Chromium refuses to connect to these ports (ERR_UNSAFE_PORT). Exposed as a
# function so the production launcher can validate its origin-derived port.
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

# Development and verification derive every browser-facing port here. Hosted
# production PORT is container-internal; the self-hosted launcher validates its
# browser-facing origin port after deriving it.
if [ "${NODE_ENV}" != "production" ]; then
  remdo_assert_browser_safe_port "${PORT}"
  remdo_assert_browser_safe_port "${VITEST_PORT}"
  remdo_assert_browser_safe_port "${PREVIEW_PORT}"
fi

export NODE_ENV HOST PUBLIC_HOST PORT_BASE PORT DATA_DIR COLLAB_ENABLED DEV_DOCUMENT_ID CI TMPDIR
export VITEST_PORT COLLAB_SERVER_PORT API_SERVER_PORT PREVIEW_PORT YSWEET_CONNECTION_STRING
export AUTH_SECRET ADMIN_SECRET YSWEET_AUTH_KEY YSWEET_SERVER_TOKEN APP_ORIGIN ALLOW_SIGNUP
