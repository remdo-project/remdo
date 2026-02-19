#!/usr/bin/env bash
set -euo pipefail

# Starts docker/run.sh on a remote host and keeps a same-port localhost tunnel.
# Required env: PROD_APP_ADDR (user@host:~/projects/remdo).

ROOT_DIR="$(git rev-parse --show-toplevel)"
# shellcheck disable=SC1090 # allow sourcing repo-local .env
. "${ROOT_DIR}/.env"

PORT="${PORT:-4000}"
REMOTE_APP_ADDR="${PROD_APP_ADDR:?Set PROD_APP_ADDR in .env (e.g. deploy@prod.example.com:~/projects/remdo)}"
REMOTE_APP_ADDR="${REMOTE_APP_ADDR%/}"

if [[ "${REMOTE_APP_ADDR}" != *:* ]]; then
  echo "Remote address must use user@host:/path format: ${REMOTE_APP_ADDR}" >&2
  exit 1
fi

REMOTE_HOST="${REMOTE_APP_ADDR%%:*}"
REMOTE_REPO_DIR="${REMOTE_APP_ADDR#*:}"

echo "Remote run target: ${REMOTE_HOST}:${REMOTE_REPO_DIR}"
echo "Tunnel target: http://127.0.0.1:${PORT}"

exec ssh -t -L "${PORT}:127.0.0.1:${PORT}" "${REMOTE_HOST}" \
  "cd ${REMOTE_REPO_DIR} && git pull && PORT=${PORT} ./docker/run.sh"
