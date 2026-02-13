#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd -- "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
IMAGE_NAME="${IMAGE_NAME:-remdo}"

# shellcheck disable=SC1091 # shared helper lives in the repo.
. "${ROOT_DIR}/tools/lib/docker.sh"
remdo_load_dotenv "${ROOT_DIR}"
remdo_load_env_defaults "${ROOT_DIR}"

: "${AUTH_PASSWORD:?Set AUTH_PASSWORD in ${ROOT_DIR}/.env}"

if (( ${#AUTH_PASSWORD} < 10 )); then
  echo "Password must be at least 10 characters." >&2
  exit 1
fi

remdo_docker_build "${ROOT_DIR}" "${IMAGE_NAME}"

ENV_FILE="${ROOT_DIR}/.env"
DOCKER_ENV_ARGS=()
[[ -f "${ENV_FILE}" ]] && DOCKER_ENV_ARGS=(--env-file "${ENV_FILE}")

remdo_docker_run "${IMAGE_NAME}" --rm "${DOCKER_ENV_ARGS[@]}" \
  -e AUTH_USER="${AUTH_USER}" \
  -e AUTH_PASSWORD="${AUTH_PASSWORD}" \
  -e TINYAUTH_APP_URL="${TINYAUTH_APP_URL}"
