#!/usr/bin/env sh
# Shared env defaults/derivations. Source from scripts; do not exec directly.

: "${NODE_ENV:=development}"
: "${HOST:=127.0.0.1}"
: "${PORT:=4000}"
: "${DATA_DIR:=data}"
: "${COLLAB_ENABLED:=true}"
: "${COLLAB_DOCUMENT_ID:=main}"
: "${CI:=false}"
: "${VITEST_PREVIEW:=false}"

if [ -z "${BASICAUTH_USER:-}" ]; then
  if [ -n "${USER:-}" ]; then
    BASICAUTH_USER="${USER}"
  else
    BASICAUTH_USER="$(id -un)"
  fi
fi

if [ -n "${REMDO_ROOT:-}" ] && [ "${DATA_DIR#"/"}" = "${DATA_DIR}" ]; then
  DATA_DIR="${REMDO_ROOT%/}/${DATA_DIR}"
fi

: "${HMR_PORT:=$((PORT + 1))}"
: "${VITEST_PORT:=$((PORT + 2))}"
: "${VITEST_PREVIEW_PORT:=$((PORT + 3))}"
: "${COLLAB_SERVER_PORT:=$((PORT + 4))}"
: "${COLLAB_CLIENT_PORT:=${COLLAB_SERVER_PORT}}"
: "${PREVIEW_PORT:=$((PORT + 5))}"
: "${PLAYWRIGHT_UI_PORT:=$((PORT + 6))}"

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
  "${PLAYWRIGHT_UI_PORT}"
do
  for restricted_port in ${restricted_ports}; do
    if [ "${derived_port}" = "${restricted_port}" ]; then
      echo "Port ${derived_port} is blocked by Chromium. Pick a different PORT base." >&2
      exit 1
    fi
  done
done

if [ "${NODE_ENV}" = "test" ] && [ -z "${COLLAB_ORIGIN:-}" ]; then
  COLLAB_ORIGIN="http://${HOST}:${COLLAB_SERVER_PORT}"
fi

export NODE_ENV HOST PORT DATA_DIR COLLAB_ENABLED COLLAB_DOCUMENT_ID COLLAB_ORIGIN CI VITEST_PREVIEW BASICAUTH_USER
export HMR_PORT VITEST_PORT VITEST_PREVIEW_PORT COLLAB_SERVER_PORT COLLAB_CLIENT_PORT PREVIEW_PORT PLAYWRIGHT_UI_PORT
