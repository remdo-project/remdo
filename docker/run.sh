#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${SCRIPT_DIR}/.env"
IMAGE_NAME="${IMAGE_NAME:-remdo}"

set -a
# shellcheck disable=SC1090
. "${ENV_FILE}"
set +a

export REMDO_ROOT="${REMDO_ROOT:-${SCRIPT_DIR}}"
# shellcheck disable=SC1091 # shared defaults live in the repo.
. "${SCRIPT_DIR}/tools/env.defaults.sh"

: "${BASICAUTH_PASSWORD:?Set BASICAUTH_PASSWORD in ${ENV_FILE}}"
: "${PORT:?Set PORT in ${ENV_FILE}}"

if (( ${#BASICAUTH_PASSWORD} < 10 )); then
  echo "Password must be at least 10 characters." >&2
  exit 1
fi

docker build -f "${SCRIPT_DIR}/docker/Dockerfile" \
  -t "${IMAGE_NAME}" \
  "${SCRIPT_DIR}"

docker run --rm \
  --env-file "${ENV_FILE}" \
  -e DATA_DIR="/data" \
  -v "${DATA_DIR}:/data" \
  -p "${PORT}:${PORT}" \
  "${IMAGE_NAME}"
