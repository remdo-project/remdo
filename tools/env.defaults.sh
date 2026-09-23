#!/usr/bin/env sh
# Shared env defaults/derivations. Source from scripts; do not exec directly.

# Chromium refuses to connect to these ports (ERR_UNSAFE_PORT). Exposed as a
# function so the production launcher can validate its origin-derived port.
# Variables are _rbsp_-prefixed because POSIX sh has no `local`; this avoids
# leaking them into the global scope of every script that sources this file.
remdo_assert_browser_safe_port() {
  _rbsp_port="$1"
  [ "${_rbsp_port}" -gt 0 ] && [ "${_rbsp_port}" -le 65535 ] || { echo "Port must be between 1 and 65535." >&2; exit 1; }
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

# The caller selects deployment behavior; no application mode variable is exported.
remdo_configure_environment() {
  : "${REMDO_ROOT:?Set REMDO_ROOT to the repo root before sourcing env.defaults.sh}"

  : "${NODE_ENV:=${1}}"
  if [ "${1}" = "production" ]; then
    unset PORT_BASE PUBLIC_HOST VITEST_PORT
  else
    : "${HOST:=localhost}"
    : "${PORT_BASE:=4000}"
    case "${PORT_BASE}" in
      *[!0-9]* | 0*) echo "PORT_BASE must be a positive decimal integer without leading zeros." >&2; exit 1 ;;
    esac
    # Shift complete local stacks before deriving their ports.
    if [ -n "${_remdo_port_base_offset:-}" ]; then
      PORT_BASE="$((PORT_BASE + _remdo_port_base_offset))"
    fi
    # Checked after the shift: the derived service ports are what must fit, and
    # only PORT among them reaches the browser-safe check below.
    [ "${PORT_BASE}" -le 65515 ] || { echo "PORT_BASE must leave room for the derived service ports." >&2; exit 1; }

    PORT="$((PORT_BASE + 0))"
    # Offsets +7..+10 are intentionally reserved for the Docker E2E containers
    # (tools/docker-test.sh currently uses +7 through +10); do not assign them to
    # a derived service port here.
    VITEST_PORT="$((PORT_BASE + 2))"
    COLLAB_SERVER_PORT="$((PORT_BASE + 4))"
    API_SERVER_PORT="$((PORT_BASE + 11))"

    if [ -z "${PUBLIC_HOST:-}" ] && [ "${HOST}" = "0.0.0.0" ]; then
      PUBLIC_HOST="$(hostname)"
      case "${PUBLIC_HOST}" in
        '' | localhost | localhost.localdomain | localdomain)
          echo "PUBLIC_HOST is required when HOST binds all interfaces without a browser-visible hostname." >&2
          exit 1 ;;
      esac
    else
      : "${PUBLIC_HOST:=${HOST}}"
    fi
    [ "${PUBLIC_HOST}" != "0.0.0.0" ] || { echo "PUBLIC_HOST must identify a browser-visible host." >&2; exit 1; }
    for _remdo_host in "${HOST}" "${PUBLIC_HOST}"; do
      case "${_remdo_host}" in
        '' | *[!A-Za-z0-9._-]*) echo "HOST and PUBLIC_HOST must be a bare hostname or IPv4 address." >&2; exit 1 ;;
      esac
    done
    unset _remdo_host
    APP_ORIGIN="http://${PUBLIC_HOST}:${PORT}"
  fi
  unset _remdo_port_base_offset

  : "${COLLAB_ENABLED:=true}"
  : "${DEV_DOCUMENT_ID:=devDoc}"
  : "${CI:=false}"
  : "${DATA_DIR:=${REMDO_ROOT%/}/data}"
  case "${DATA_DIR}" in
    /*) ;;
    *) DATA_DIR="${REMDO_ROOT%/}/${DATA_DIR}" ;;
  esac
  : "${TMPDIR:=${DATA_DIR}/tmp}"

  if [ -z "${AUTH_SECRET:-}" ] && [ "${1}" != "production" ]; then
    AUTH_SECRET="development-auth-secret-0123456789"
  fi
  if [ -z "${COLLAB_INTERNAL_SECRET:-}" ] && [ "${1}" != "production" ]; then
    COLLAB_INTERNAL_SECRET="development-collaboration-secret-0123456789"
  fi

  # Development and verification derive every browser-facing port here. Hosted
  # production PORT is container-internal; the self-hosted launcher validates its
  # browser-facing origin port after deriving it.
  if [ "${1}" != "production" ]; then
    remdo_assert_browser_safe_port "${PORT}"
    remdo_assert_browser_safe_port "${VITEST_PORT}"
  fi

  export NODE_ENV HOST PUBLIC_HOST PORT_BASE PORT DATA_DIR COLLAB_ENABLED DEV_DOCUMENT_ID CI TMPDIR
  export VITEST_PORT COLLAB_SERVER_PORT API_SERVER_PORT
  export AUTH_SECRET COLLAB_INTERNAL_SECRET APP_ORIGIN
  if [ "$1" = production ]; then
    DJANGO_SETTINGS_MODULE=remdo.settings
  else
    : "${DJANGO_SETTINGS_MODULE:=remdo.development}"
  fi
  export DJANGO_SETTINGS_MODULE
}
