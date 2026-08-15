#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd -- "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
IMAGE_NAME="${IMAGE_NAME:-remdo}"
# shellcheck disable=SC1091 # shared helper lives in the repo.
. "${ROOT_DIR}/tools/lib/docker.sh"

if [[ "$#" -ne 0 ]]; then
  echo "Usage: pnpm run dev:docker" >&2
  exit 1
fi

HOME_ORIGIN="$(pnpm exec tsx ./tools/dev/print-app-origin.ts)"
HOME_DATA_DIR="${DATA_DIR%/}/docker-home"
HOME_CONTAINER_NAME="remdo-dev-docker-${PORT}"

# Host networking has no publish step, so Caddy binds the configured host
# directly. `localhost` is a name rather than an address.
case "${HOST}" in
  localhost) BIND_HOST="127.0.0.1" ;;
  *) BIND_HOST="${HOST}" ;;
esac

remdo_require_rootless_host_network

cleanup_home_container() {
  docker rm -f "${HOME_CONTAINER_NAME}" >/dev/null 2>&1 || true
}
trap cleanup_home_container EXIT INT TERM
cleanup_home_container

echo "Starting private Docker app: ${HOME_ORIGIN}"
remdo_docker_build "${ROOT_DIR}" "${IMAGE_NAME}"
remdo_docker_run "${IMAGE_NAME}" "${HOME_DATA_DIR}" \
  --rm \
  --userns=host \
  --name "${HOME_CONTAINER_NAME}" \
  --network=host \
  -e ADMIN_SECRET="${ADMIN_SECRET}" \
  -e APP_ORIGIN="${HOME_ORIGIN}" \
  -e ALLOW_SIGNUP=false \
  -e REMDO_GATEWAY_BIND_ADDRESS="${BIND_HOST}" \
  -e API_SERVER_PORT="${API_SERVER_PORT}" \
  -e COLLAB_SERVER_PORT="${COLLAB_SERVER_PORT}" \
  -e REMDO_DEV_CONTAINER=true \
  -e AUTH_SECRET="${AUTH_SECRET}" \
  -e YSWEET_AUTH_KEY="${YSWEET_AUTH_KEY}" \
  -e YSWEET_SERVER_TOKEN="${YSWEET_SERVER_TOKEN}"
