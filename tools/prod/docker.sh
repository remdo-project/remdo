#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd -- "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
IMAGE_NAME="${IMAGE_NAME:-remdo}"

# shellcheck disable=SC1091 # shared helper lives in the repo.
. "${ROOT_DIR}/tools/lib/docker.sh"
remdo_load_dotenv "${ROOT_DIR}"
NODE_ENV=production
export NODE_ENV

: "${APP_ORIGIN:=https://remdo.localhost:8443}"
: "${DATA_DIR:=${ROOT_DIR%/}/data/production}"
PORT=443
if [[ "${APP_ORIGIN}" =~ :([0-9]+)$ ]]; then
  PORT="${BASH_REMATCH[1]}"
fi
CONTAINER_NAME="remdo-${PORT}"
case "${PORT}" in
  4004|4011)
    echo "APP_ORIGIN cannot use container-reserved port ${PORT}." >&2
    exit 1
    ;;
esac
HOST="${HOST:-127.0.0.1}"
case "${HOST}" in
  127.0.0.1|0.0.0.0)
    ;;
  *)
    echo "HOST must be 127.0.0.1 or 0.0.0.0 in production." >&2
    exit 1
    ;;
esac
if [[ "${HOST}" == "0.0.0.0" && "${PORT}" != "443" ]]; then
  echo "HOST=0.0.0.0 requires APP_ORIGIN to use the default HTTPS port 443." >&2
  exit 1
fi
remdo_load_env_defaults "${ROOT_DIR}"
remdo_assert_browser_safe_port "${PORT}"

# Operators set only ADMIN_SECRET (never auto-generated). AUTH_SECRET and the
# Y-Sweet auth_key/server_token pair are bootstrapped inside the container from
# the persistent DATA_DIR mount; pass them through only when explicitly provided.
: "${ADMIN_SECRET:?Set ADMIN_SECRET in .env}"
if [[ "${#ADMIN_SECRET}" -lt 32 ]]; then
  echo "ADMIN_SECRET must be at least 32 characters." >&2
  exit 1
fi
if [[ -n "${AUTH_SECRET:-}" && "${#AUTH_SECRET}" -lt 32 ]]; then
  echo "AUTH_SECRET must be at least 32 characters when set." >&2
  exit 1
fi

remdo_docker_build "${ROOT_DIR}" "${IMAGE_NAME}"

if docker container inspect "${CONTAINER_NAME}" >/dev/null 2>&1; then
  docker stop "${CONTAINER_NAME}"
  docker rm "${CONTAINER_NAME}" >/dev/null 2>&1 || true
  container_removed=false
  for _ in {1..100}; do
    if ! docker container inspect "${CONTAINER_NAME}" >/dev/null 2>&1; then
      container_removed=true
      break
    fi
    sleep 0.1
  done
  if [[ "${container_removed}" != "true" ]]; then
    echo "Timed out waiting for container ${CONTAINER_NAME} to be removed." >&2
    exit 1
  fi
fi

DOCKER_ENV_ARGS=(
  -e ADMIN_SECRET="${ADMIN_SECRET}"
  -e APP_ORIGIN="${APP_ORIGIN}"
  -e ALLOW_SIGNUP="${ALLOW_SIGNUP}"
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

DOCKER_RUN_ARGS=(-d --restart unless-stopped --userns=host --name "${CONTAINER_NAME}")
DOCKER_RUN_ARGS+=(-p "${HOST}:${PORT}:${PORT}")
remdo_docker_run "${IMAGE_NAME}" "${DATA_DIR}" "${DOCKER_RUN_ARGS[@]}" "${DOCKER_ENV_ARGS[@]}"

container_is_healthy() {
  docker exec "${CONTAINER_NAME}" node -e '
    fetch("http://127.0.0.1:4011/health")
      .then(response => process.exit(response.ok ? 0 : 1))
      .catch(() => process.exit(1));
  ' >/dev/null 2>&1
}

startup_ready=false
for _ in {1..60}; do
  if container_is_healthy; then
    startup_ready=true
    break
  fi

  container_state="$(docker inspect --format '{{.State.Running}} {{.RestartCount}}' \
    "${CONTAINER_NAME}" 2>/dev/null || true)"
  if [[ "${container_state}" != "true 0" ]]; then
    break
  fi
  sleep 0.5
done

if [[ "${startup_ready}" == "true" ]]; then
  # Docker activates restart policies only after a container has remained up
  # for ten seconds. Do not promise automatic recovery before that boundary.
  sleep 10
  container_state="$(docker inspect --format '{{.State.Running}} {{.RestartCount}}' \
    "${CONTAINER_NAME}" 2>/dev/null || true)"
  if [[ "${container_state}" != "true 0" ]] || ! container_is_healthy; then
    startup_ready=false
  fi
fi

if [[ "${startup_ready}" != "true" ]]; then
  docker logs "${CONTAINER_NAME}" >&2 || true
  docker stop "${CONTAINER_NAME}" >/dev/null 2>&1 || true
  echo "RemDo failed to become healthy; container ${CONTAINER_NAME} was stopped." >&2
  exit 1
fi

echo "Docker target: ${APP_ORIGIN}"
echo "Verify health: ${APP_ORIGIN%/}/health"
echo "Follow logs: docker logs -f ${CONTAINER_NAME}"
echo "Stop RemDo: docker stop ${CONTAINER_NAME}"
