#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd -- "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

# shellcheck disable=SC1091 # shared helper lives in the repo.
. "${ROOT_DIR}/tools/lib/docker.sh"
remdo_load_dotenv "${ROOT_DIR}"
remdo_load_env_defaults "${ROOT_DIR}"

SOURCE_ORIGIN="${AUTH_URL:-http://localhost:${PORT}}"
SOURCE_TOKEN_HOST="$(ip -4 route get 1.1.1.1 | sed -n 's/.* src \([0-9.]*\).*/\1/p')"
if [[ -z "${SOURCE_TOKEN_HOST}" ]]; then
  echo "Failed to detect a source token host address." >&2
  exit 1
fi
SOURCE_TOKEN_ORIGIN="http://${SOURCE_TOKEN_HOST}:${PORT}"
HOME_PORT="$((PORT_BASE + 40))"
HOME_ORIGIN="http://127.0.0.1:${HOME_PORT}"
HOME_LOCALHOST_ORIGIN="http://localhost:${HOME_PORT}"
HOME_DATA_DIR="${DATA_DIR%/}/docker-home"
HOME_CONTAINER_NAME="remdo-dev-docker-${HOME_PORT}"
LINKABLE_REMDO_SERVERS_JSON='[{"id":"source","label":"Local dev server","baseUrl":"'"${SOURCE_ORIGIN}"'","tokenBaseUrl":"'"${SOURCE_TOKEN_ORIGIN}"'","clientId":"'"${REMDO_DEV_OAUTH_CLIENT_ID}"'","clientSecret":"'"${REMDO_DEV_OAUTH_CLIENT_SECRET}"'"}]'

cleanup_home_container() {
  docker rm -f "${HOME_CONTAINER_NAME}" >/dev/null 2>&1 || true
}
trap cleanup_home_container EXIT INT TERM

echo "Provisioning source OAuth client for ${HOME_ORIGIN}..."
env \
  AUTH_URL="${SOURCE_ORIGIN}" \
  REMDO_DEV_HOME_ORIGIN="${HOME_ORIGIN}" \
  pnpm run dev:oauth-client

echo "Provisioning OAuth home users in ${HOME_DATA_DIR}..."
env \
  AUTH_URL="${HOME_ORIGIN}" \
  DATA_DIR="${HOME_DATA_DIR}" \
  PORT="${HOME_PORT}" \
  REMDO_DEV_HOME_ORIGIN="${HOME_ORIGIN}" \
  pnpm run dev:oauth-client

echo "Starting OAuth home: ${HOME_ORIGIN}"
echo "OAuth home alias: ${HOME_LOCALHOST_ORIGIN}"
echo "OAuth source: ${SOURCE_ORIGIN}"
echo "Tunnel from a remote browser host: tools/remote/open-remdo-tunnel.sh <user>@<host>:${PORT_BASE}"

cleanup_home_container
env \
  APP_PUBLIC_URL="${HOME_ORIGIN}" \
  AUTH_SECRET="${AUTH_SECRET}" \
  ADMIN_SECRET="${ADMIN_SECRET}" \
  DATA_DIR="${HOME_DATA_DIR}" \
  CADDY_SITE_ADDRESSES="${HOME_ORIGIN} ${HOME_LOCALHOST_ORIGIN}" \
  LINKABLE_REMDO_SERVERS_JSON="${LINKABLE_REMDO_SERVERS_JSON}" \
  YSWEET_AUTH_KEY="${YSWEET_AUTH_KEY}" \
  YSWEET_SERVER_TOKEN="${YSWEET_SERVER_TOKEN}" \
  ALLOW_SIGNUP="${ALLOW_SIGNUP}" \
  REMDO_DOCKER_CONTAINER_NAME="${HOME_CONTAINER_NAME}" \
  PORT="${HOME_PORT}" \
  RUN_MODE_PORT_SHIFT=40 \
  "${ROOT_DIR}/tools/prod/docker.sh"
