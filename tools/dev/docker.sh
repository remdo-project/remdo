#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd -- "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

# shellcheck disable=SC1091 # shared helper lives in the repo.
. "${ROOT_DIR}/tools/lib/docker.sh"
remdo_load_dotenv "${ROOT_DIR}"
remdo_load_env_defaults "${ROOT_DIR}"

# The source is the local dev server. Its origin uses the host's real network IP
# so it is identical AND reachable from both the browser (on the host) and the
# containerized home — matching the same-origin runtime model. (rootless Docker
# containers reach host services only via the interface IP, not localhost / the
# docker bridge gateway.)
SOURCE_HOST_IP="$(ip -4 route get 1.1.1.1 | sed -n 's/.* src \([0-9.]*\).*/\1/p')"
if [[ -z "${SOURCE_HOST_IP}" ]]; then
  echo "Failed to detect a host IP for the source origin." >&2
  exit 1
fi
SOURCE_ORIGIN="http://${SOURCE_HOST_IP}:${PORT}"
HOME_PORT="$((PORT_BASE + 40))"
HOME_ORIGIN="http://127.0.0.1:${HOME_PORT}"
HOME_LOCALHOST_ORIGIN="http://localhost:${HOME_PORT}"
HOME_DATA_DIR="${DATA_DIR%/}/docker-home"
HOME_CONTAINER_NAME="remdo-dev-docker-${HOME_PORT}"

cleanup_home_container() {
  docker rm -f "${HOME_CONTAINER_NAME}" >/dev/null 2>&1 || true
}
trap cleanup_home_container EXIT INT TERM

echo "Provisioning source dev users for ${SOURCE_ORIGIN}..."
env AUTH_URL="${SOURCE_ORIGIN}" pnpm run dev:users

echo "Starting OAuth home: ${HOME_ORIGIN}"
echo "OAuth home alias: ${HOME_LOCALHOST_ORIGIN}"
echo "OAuth source: ${SOURCE_ORIGIN}"
# The source must advertise the SAME host-IP origin the home links it by, or
# Better Auth rejects host-IP requests as an invalid origin. A plain
# `HOST=0.0.0.0 pnpm run dev` derives AUTH_URL=http://localhost:PORT, so the
# source needs AUTH_URL set explicitly.
echo "Start the source dev server with:"
echo "  HOST=0.0.0.0 AUTH_URL=${SOURCE_ORIGIN} pnpm run dev"
echo "Then add + register the source from the home admin panel at ${HOME_ORIGIN}/admin,"
echo "and link a user account against it."
echo "Tunnel from a remote browser host: tools/remote/open-remdo-tunnel.sh <user>@<host>:${PORT_BASE}"

cleanup_home_container
env \
  APP_PUBLIC_URL="${HOME_ORIGIN}" \
  AUTH_SECRET="${AUTH_SECRET}" \
  ADMIN_SECRET="${ADMIN_SECRET}" \
  DATA_DIR="${HOME_DATA_DIR}" \
  CADDY_SITE_ADDRESSES="${HOME_ORIGIN} ${HOME_LOCALHOST_ORIGIN}" \
  YSWEET_AUTH_KEY="${YSWEET_AUTH_KEY}" \
  YSWEET_SERVER_TOKEN="${YSWEET_SERVER_TOKEN}" \
  ALLOW_SIGNUP="${ALLOW_SIGNUP}" \
  REMDO_DOCKER_CONTAINER_NAME="${HOME_CONTAINER_NAME}" \
  PORT="${HOME_PORT}" \
  "${ROOT_DIR}/tools/prod/docker.sh"
