#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd -- "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
IMAGE_NAME="${IMAGE_NAME:-remdo}"
CALLER_PORT="${PORT-}"

# shellcheck disable=SC1091 # shared helper lives in the repo.
. "${ROOT_DIR}/tools/lib/docker.sh"
remdo_load_dotenv "${ROOT_DIR}"

if [[ -n "${CALLER_PORT}" && -n "${PORT:-}" && "${PORT:-}" != "${CALLER_PORT}" ]]; then
  echo "PORT mismatch: caller provided ${CALLER_PORT}, but ${ROOT_DIR}/.env sets ${PORT}." >&2
  echo "Align the values or unset one source before running docker/run.sh." >&2
  exit 1
fi

remdo_load_env_defaults "${ROOT_DIR}"
remdo_configure_docker_runtime

remdo_docker_build "${ROOT_DIR}" "${IMAGE_NAME}"

echo "Docker local HTTPS target: ${APP_PUBLIC_URL}"

remdo_require_rootless_docker

DOCKER_ENV_ARGS=(
  -e AUTH_SECRET="${AUTH_SECRET-}"
  -e ADMIN_SECRET="${ADMIN_SECRET-}"
  -e YSWEET_AUTH_KEY="${YSWEET_AUTH_KEY-}"
  -e YSWEET_SERVER_TOKEN="${YSWEET_SERVER_TOKEN-}"
  -e APP_PUBLIC_URL="${APP_PUBLIC_URL}"
  -e ALLOW_SIGNUP="${ALLOW_SIGNUP}"
  -e PORT="${PORT}"
)

remdo_docker_run "${IMAGE_NAME}" "${DATA_DIR}" --rm --userns=host \
  "${DOCKER_ENV_ARGS[@]}"
