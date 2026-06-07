#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd -- "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
IMAGE_NAME="${IMAGE_NAME:-remdo}"

# shellcheck disable=SC1091 # shared helper lives in the repo.
. "${ROOT_DIR}/tools/lib/docker.sh"
remdo_load_dotenv "${ROOT_DIR}"
NODE_ENV=production
export NODE_ENV
: "${RUN_MODE_PORT_SHIFT:=40}"
remdo_load_env_defaults "${ROOT_DIR}"
if [[ -z "${APP_PUBLIC_URL:-}" ]]; then
  remdo_configure_docker_runtime
fi
if ! PORT="$(node -e '
  const url = new URL(process.argv[1]);
  const port = url.port || (url.protocol === "https:" ? "443" : url.protocol === "http:" ? "80" : "");
  if (!port) process.exit(1);
  console.log(port);
' "${APP_PUBLIC_URL}")"; then
  echo "APP_PUBLIC_URL must be an absolute http(s) URL." >&2
  exit 1
fi
export PORT

: "${AUTH_SECRET:?Set AUTH_SECRET in .env}"
: "${ADMIN_SECRET:?Set ADMIN_SECRET in .env}"
: "${YSWEET_AUTH_KEY:?Set YSWEET_AUTH_KEY in .env}"
: "${YSWEET_SERVER_TOKEN:?Set YSWEET_SERVER_TOKEN in .env}"

remdo_docker_build "${ROOT_DIR}" "${IMAGE_NAME}"
remdo_require_rootless_docker

DOCKER_ENV_ARGS=(
  -e AUTH_SECRET="${AUTH_SECRET}"
  -e ADMIN_SECRET="${ADMIN_SECRET}"
  -e YSWEET_AUTH_KEY="${YSWEET_AUTH_KEY}"
  -e YSWEET_SERVER_TOKEN="${YSWEET_SERVER_TOKEN}"
  -e APP_PUBLIC_URL="${APP_PUBLIC_URL}"
  -e ALLOW_SIGNUP="${ALLOW_SIGNUP}"
  -e HOST=127.0.0.1
  -e PORT_BASE="${PORT_BASE}"
  -e PORT="${PORT}"
)
if [[ -n "${LINKABLE_REMDO_SERVERS_JSON:-}" ]]; then
  DOCKER_ENV_ARGS+=(-e LINKABLE_REMDO_SERVERS_JSON="${LINKABLE_REMDO_SERVERS_JSON}")
fi

echo "Docker target: ${APP_PUBLIC_URL}"
DOCKER_RUN_ARGS=(--rm --userns=host)
if [[ -n "${REMDO_DOCKER_CONTAINER_NAME:-}" ]]; then
  DOCKER_RUN_ARGS+=(--name "${REMDO_DOCKER_CONTAINER_NAME}")
fi
remdo_docker_run "${IMAGE_NAME}" "${DATA_DIR}" "${DOCKER_RUN_ARGS[@]}" "${DOCKER_ENV_ARGS[@]}"
