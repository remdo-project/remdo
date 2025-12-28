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

if [ "${NODE_ENV}" = "test" ] && [ -z "${COLLAB_ORIGIN:-}" ]; then
  COLLAB_ORIGIN="http://${HOST}:${COLLAB_SERVER_PORT}"
fi

export NODE_ENV HOST PORT DATA_DIR COLLAB_ENABLED COLLAB_DOCUMENT_ID COLLAB_ORIGIN CI VITEST_PREVIEW BASICAUTH_USER
export HMR_PORT VITEST_PORT VITEST_PREVIEW_PORT COLLAB_SERVER_PORT COLLAB_CLIENT_PORT PREVIEW_PORT PLAYWRIGHT_UI_PORT
