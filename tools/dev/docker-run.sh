#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd -- "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
# shellcheck disable=SC1091 # shared helper lives in the repo.
. "${ROOT_DIR}/tools/lib/docker.sh"

HOME_ORIGIN="$(pnpm exec tsx ./tools/dev/print-app-public-url.ts)"
HOME_DATA_DIR="${DATA_DIR%/}/docker-home"
HOME_CONTAINER_NAME="remdo-dev-docker-${PORT}"
NETWORK="${REMDO_DEV_DOCKER_NETWORK:-bridge}"

# The gateway always listens on PORT inside the container; only the address it
# binds to and whether the port is published differ per network mode.
CADDY_SITE_ADDRESSES="http://:${PORT}"

# `localhost` is a name, not an address: resolve it to the loopback address both
# `docker -p` and Caddy's `bind` require.
case "${HOST}" in
  localhost) BIND_HOST="127.0.0.1" ;;
  *) BIND_HOST="${HOST}" ;;
esac

case "${NETWORK}" in
  bridge)
    # In bridge mode the container binds every interface and Docker restricts
    # reachability by publishing on BIND_HOST. `docker -p` needs IPv6 bracketed.
    CADDY_BIND_DIRECTIVE="bind 0.0.0.0"
    case "${BIND_HOST}" in
      *:*) PUBLISH_HOST="[${BIND_HOST}]" ;;
      *) PUBLISH_HOST="${BIND_HOST}" ;;
    esac
    ;;
  host)
    # Host networking has no publish step, so Caddy itself must bind BIND_HOST.
    remdo_require_rootless_host_network
    PUBLISH_HOST=""
    CADDY_BIND_DIRECTIVE="bind ${BIND_HOST}"
    ;;
  *)
    echo "Unsupported Docker network: ${NETWORK}" >&2
    exit 1
    ;;
esac

cleanup_home_container() {
  docker rm -f "${HOME_CONTAINER_NAME}" >/dev/null 2>&1 || true
}
trap cleanup_home_container EXIT INT TERM
cleanup_home_container

echo "Starting private Docker app: ${HOME_ORIGIN}"
env \
  NODE_ENV=production \
  APP_PUBLIC_URL="${HOME_ORIGIN}" \
  AUTH_SECRET="${AUTH_SECRET}" \
  ADMIN_SECRET="${ADMIN_SECRET}" \
  DATA_DIR="${HOME_DATA_DIR}" \
  CADDY_SITE_ADDRESSES="${CADDY_SITE_ADDRESSES}" \
  CADDY_BIND_DIRECTIVE="${CADDY_BIND_DIRECTIVE}" \
  YSWEET_AUTH_KEY="${YSWEET_AUTH_KEY}" \
  YSWEET_SERVER_TOKEN="${YSWEET_SERVER_TOKEN}" \
  ALLOW_SIGNUP=false \
  REMDO_DOCKER_CONTAINER_NAME="${HOME_CONTAINER_NAME}" \
  REMDO_DOCKER_NETWORK="${NETWORK}" \
  REMDO_DOCKER_PUBLISH_HOST="${PUBLISH_HOST}" \
  PORT_BASE="${PORT_BASE}" \
  PORT="${PORT}" \
  "${ROOT_DIR}/tools/prod/docker.sh"
