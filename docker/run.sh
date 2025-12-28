#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${SCRIPT_DIR}/.env"
IMAGE_NAME="${IMAGE_NAME:-remdo}"

set -a
# shellcheck disable=SC1090
. "${ENV_FILE}"
set +a

if [[ -z "${BASICAUTH_USER:-}" ]]; then
  if [[ -n "${USER:-}" ]]; then
    BASICAUTH_USER="${USER}"
  else
    BASICAUTH_USER="$(id -un)"
  fi
  export BASICAUTH_USER
fi

: "${BASICAUTH_USER:?Set BASICAUTH_USER in ${ENV_FILE} or ensure USER is set}"
: "${BASICAUTH_PASSWORD:?Set BASICAUTH_PASSWORD in ${ENV_FILE}}"
: "${PORT:?Set PORT in ${ENV_FILE}}"
: "${COLLAB_SERVER_PORT:?Set COLLAB_SERVER_PORT in ${ENV_FILE}}"
: "${DATA_DIR:?Set DATA_DIR in ${ENV_FILE}}"

if (( ${#BASICAUTH_PASSWORD} < 10 )); then
  echo "Password must be at least 10 characters." >&2
  exit 1
fi

docker build -f "${SCRIPT_DIR}/docker/Dockerfile" \
  --build-arg PORT="${PORT}" \
  -t "${IMAGE_NAME}" \
  "${SCRIPT_DIR}"

docker run --rm \
  --env-file "${ENV_FILE}" \
  -e DATA_DIR="/data" \
  -v "${DATA_DIR}:/data" \
  -p "${PORT}:${PORT}" \
  "${IMAGE_NAME}"
