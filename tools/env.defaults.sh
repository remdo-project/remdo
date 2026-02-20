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

# Derive a same-host canonical app base domain when no explicit override is provided.
# Single-label hostnames map to app.<hostname>.shared; dotted/localhost/unknown map to app.remdo.localhost.
if [ -z "${PUBLIC_BASE_DOMAIN:-}" ]; then
  derived_hostname="${REMDO_HOSTNAME:-${HOSTNAME:-}}"

  if [ -z "${derived_hostname}" ] && command -v hostname >/dev/null 2>&1; then
    derived_hostname="$(hostname 2>/dev/null || true)"
  fi

  derived_hostname="$(printf '%s' "${derived_hostname}" | tr '[:upper:]' '[:lower:]')"
  derived_hostname="${derived_hostname%.}"

  case "${derived_hostname}" in
    ""|localhost|localhost.localdomain|localdomain|*.*)
      PUBLIC_BASE_DOMAIN="app.remdo.localhost"
      ;;
    *)
      PUBLIC_BASE_DOMAIN="app.${derived_hostname}.shared"
      ;;
  esac
fi

# Default AUTH_USER to the current shell user.
if [ -z "${AUTH_USER:-}" ]; then
  if [ -n "${USER:-}" ]; then
    AUTH_USER="${USER}"
  else
    AUTH_USER="$(id -un)"
  fi
fi

# Derive all service/tool ports from the base PORT to keep multi-workdir runs predictable.
: "${HMR_PORT:=$((PORT + 1))}"
: "${VITEST_PORT:=$((PORT + 2))}"
: "${VITEST_PREVIEW_PORT:=$((PORT + 3))}"
: "${COLLAB_SERVER_PORT:=$((PORT + 4))}"
: "${COLLAB_CLIENT_PORT:=${COLLAB_SERVER_PORT}}"
: "${PREVIEW_PORT:=$((PORT + 5))}"
: "${PLAYWRIGHT_UI_PORT:=$((PORT + 6))}"
: "${DOCKER_TEST_PORT:=$((PORT + 7))}"
: "${TINYAUTH_PORT:=$((PORT + 8))}"
: "${PLAYWRIGHT_WEB_PORT:=$((PORT + 9))}"
# Tinyauth validates sessions against this canonical app URL/host.
: "${TINYAUTH_APP_URL:=http://${PUBLIC_BASE_DOMAIN}:${PORT}}"

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
  "${TINYAUTH_PORT}" \
  "${PLAYWRIGHT_WEB_PORT}"
do
  for restricted_port in ${restricted_ports}; do
    if [ "${derived_port}" = "${restricted_port}" ]; then
      echo "Port ${derived_port} is blocked by Chromium. Pick a different PORT base." >&2
      exit 1
    fi
  done
done

export NODE_ENV HOST PORT DATA_DIR COLLAB_ENABLED COLLAB_DOCUMENT_ID CI VITEST_PREVIEW TMPDIR
export PUBLIC_BASE_DOMAIN
export AUTH_USER TINYAUTH_PORT TINYAUTH_APP_URL
export HMR_PORT VITEST_PORT VITEST_PREVIEW_PORT COLLAB_SERVER_PORT COLLAB_CLIENT_PORT PREVIEW_PORT PLAYWRIGHT_UI_PORT DOCKER_TEST_PORT PLAYWRIGHT_WEB_PORT
