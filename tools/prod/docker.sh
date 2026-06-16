#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd -- "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
IMAGE_NAME="${IMAGE_NAME:-remdo}"

# shellcheck disable=SC1091 # shared helper lives in the repo.
. "${ROOT_DIR}/tools/lib/docker.sh"
remdo_load_dotenv "${ROOT_DIR}"
NODE_ENV=production
export NODE_ENV

# In prod the listen PORT is an independent input (platform-injected, else 8080),
# never derived from APP_PUBLIC_URL. Default it before sourcing env defaults so the
# ${PORT:=...} there respects this value instead of PORT_BASE.
: "${PORT:=8080}"
export PORT

remdo_load_env_defaults "${ROOT_DIR}"
if [[ -z "${APP_PUBLIC_URL:-}" ]]; then
  remdo_configure_docker_runtime
fi
# PORT is already validated by remdo_load_env_defaults above; remdo_configure_docker_runtime
# only derives APP_PUBLIC_URL from it (URL-from-PORT) and never changes it. When
# APP_PUBLIC_URL is set, it is used as-is and PORT is left untouched.

# The launcher publishes only -p ${PORT}:${PORT}. If APP_PUBLIC_URL advertises a
# different explicit port, a directly-exposed (un-proxied) deploy is unreachable
# at that URL. This is fine behind a TLS-terminating proxy (Render, Caddy) that
# forwards :443 -> PORT, so warn rather than fail.
if [[ -n "${APP_PUBLIC_URL:-}" ]]; then
  app_public_url_port="$(node -e '
    const url = new URL(process.argv[1]);
    process.stdout.write(url.port);
  ' "${APP_PUBLIC_URL}" 2>/dev/null || true)"
  if [[ -n "${app_public_url_port}" && "${app_public_url_port}" != "${PORT}" ]]; then
    echo "Warning: APP_PUBLIC_URL port (${app_public_url_port}) differs from the published PORT (${PORT})." >&2
    echo "         A directly-exposed container will not be reachable at ${APP_PUBLIC_URL};" >&2
    echo "         this is only correct behind a proxy that forwards to PORT ${PORT}." >&2
  fi
fi

# Operators set only ADMIN_SECRET (never auto-generated). AUTH_SECRET and the
# Y-Sweet auth_key/server_token pair are bootstrapped inside the container from
# the persistent DATA_DIR mount; pass them through only when explicitly provided.
: "${ADMIN_SECRET:?Set ADMIN_SECRET in .env}"

remdo_docker_build "${ROOT_DIR}" "${IMAGE_NAME}"
remdo_require_rootless_docker

DOCKER_ENV_ARGS=(
  -e ADMIN_SECRET="${ADMIN_SECRET}"
  -e APP_PUBLIC_URL="${APP_PUBLIC_URL}"
  -e ALLOW_SIGNUP="${ALLOW_SIGNUP}"
  -e LINKABLE_REMDO_SERVERS_JSON="${LINKABLE_REMDO_SERVERS_JSON:-}"
  -e CADDY_SITE_ADDRESSES="${CADDY_SITE_ADDRESSES:-}"
  -e HOST=127.0.0.1
  -e PORT_BASE="${PORT_BASE}"
  -e PORT="${PORT}"
)

# Forward bootstrap-managed secrets only when the operator set them explicitly,
# so empty values never shadow the in-container bootstrap.
if [[ -n "${AUTH_SECRET:-}" ]]; then
  DOCKER_ENV_ARGS+=(-e AUTH_SECRET="${AUTH_SECRET}")
fi
if [[ -n "${YSWEET_AUTH_KEY:-}" ]]; then
  DOCKER_ENV_ARGS+=(-e YSWEET_AUTH_KEY="${YSWEET_AUTH_KEY}")
fi
if [[ -n "${YSWEET_SERVER_TOKEN:-}" ]]; then
  DOCKER_ENV_ARGS+=(-e YSWEET_SERVER_TOKEN="${YSWEET_SERVER_TOKEN}")
fi

echo "Docker target: ${APP_PUBLIC_URL}"
DOCKER_RUN_ARGS=(--rm --userns=host)
if [[ -n "${REMDO_DOCKER_CONTAINER_NAME:-}" ]]; then
  DOCKER_RUN_ARGS+=(--name "${REMDO_DOCKER_CONTAINER_NAME}")
fi
remdo_docker_run "${IMAGE_NAME}" "${DATA_DIR}" "${DOCKER_RUN_ARGS[@]}" "${DOCKER_ENV_ARGS[@]}"
