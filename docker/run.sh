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

: "${AUTH_PASSWORD:?Set AUTH_PASSWORD in ${ROOT_DIR}/.env}"

if (( ${#AUTH_PASSWORD} < 10 )); then
  echo "Password must be at least 10 characters." >&2
  exit 1
fi

remdo_docker_build "${ROOT_DIR}" "${IMAGE_NAME}"

echo "Docker local HTTPS target: ${CADDY_SITE_ADDRESS}"

remdo_docker_run "${IMAGE_NAME}" "${DATA_DIR}" --rm \
  -e PORT="${PORT}" \
  -e AUTH_USER="${AUTH_USER}" \
  -e AUTH_PASSWORD="${AUTH_PASSWORD}" \
  -e CADDY_SITE_ADDRESS="${CADDY_SITE_ADDRESS}" \
  -e TINYAUTH_APP_URL="${TINYAUTH_APP_URL}"
