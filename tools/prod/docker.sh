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
LOOPBACK_HTTP=false
if [[ "${APP_ORIGIN}" == http://* ]]; then
  if [[ ! "${APP_ORIGIN}" =~ ^http://([a-z0-9-]+\.)+localhost:([0-9]+)$ ]]; then
    echo "HTTP APP_ORIGIN must be an exact *.localhost origin with an explicit port." >&2
    exit 1
  fi
  if [[ "${HOST}" != "127.0.0.1" ]]; then
    echo "HTTP APP_ORIGIN requires HOST=127.0.0.1." >&2
    exit 1
  fi
  LOOPBACK_HTTP=true
fi
if [[ "${HOST}" == "0.0.0.0" && "${PORT}" != "443" ]]; then
  echo "HOST=0.0.0.0 requires APP_ORIGIN to use the default HTTPS port 443." >&2
  exit 1
fi
remdo_load_env_defaults "${ROOT_DIR}" production
remdo_assert_browser_safe_port "${PORT}"

if [[ "${LOOPBACK_HTTP}" == "true" ]]; then
  if ! remdo_docker_daemon_is_rootless; then
    echo "Loopback HTTP requires a rootless Docker daemon." >&2
    exit 1
  fi
  docker_server_version="$(docker version --format '{{.Server.Version}}')"
  docker_server_major="${docker_server_version%%.*}"
  if (( docker_server_major < 28 )); then
    echo "Loopback HTTP requires Docker Engine 28.0 or newer (found ${docker_server_version})." >&2
    exit 1
  fi
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

DOCKER_ENV_ARGS=(-e APP_ORIGIN="${APP_ORIGIN}" -e DATABASE_URL="${DATABASE_URL:-}")
if [[ -n "${Y_SWEET_STORE:-}" ]]; then
  for storage_variable in Y_SWEET_STORE AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY AWS_SESSION_TOKEN AWS_REGION AWS_ENDPOINT_URL_S3 AWS_S3_USE_PATH_STYLE; do
    if [[ -n "${!storage_variable:-}" ]]; then
      export "${storage_variable}=${!storage_variable}"
      DOCKER_ENV_ARGS+=(-e "${storage_variable}")
    fi
  done
fi
if [[ "${LOOPBACK_HTTP}" == "true" ]]; then
  DOCKER_ENV_ARGS+=(-e REMDO_LAUNCHER_LOOPBACK_HTTP=true)
fi

DOCKER_RUN_ARGS=(-d --restart unless-stopped --userns=host --name "${CONTAINER_NAME}")
DOCKER_RUN_ARGS+=(-p "${HOST}:${PORT}:${PORT}")
remdo_docker_run "${IMAGE_NAME}" "${DATA_DIR}" "${DOCKER_RUN_ARGS[@]}" "${DOCKER_ENV_ARGS[@]}"

container_is_healthy() {
  docker exec "${CONTAINER_NAME}" python -c '
import os, urllib.request
request = urllib.request.Request("http://127.0.0.1:4011/api/health", headers={"Host": os.environ["APP_ORIGIN"].split("://", 1)[1]})
with urllib.request.urlopen(request, timeout=0.5) as response:
    assert response.status == 200
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

echo "Create administrator: docker exec -it ${CONTAINER_NAME} python manage.py createsuperuser"
