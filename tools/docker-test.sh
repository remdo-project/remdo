#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd -- "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck disable=SC1091 # shared helper lives in the repo.
. "${ROOT_DIR}/tools/lib/docker.sh"
remdo_load_dotenv "${ROOT_DIR}"

if [[ -z "${DATA_DIR:-}" ]]; then
  DATA_DIR="$(mktemp -d -t remdo-docker-test-XXXXXX)"
  CLEAN_DATA_DIR="true"
else
  CLEAN_DATA_DIR="false"
fi

: "${PORT:=4000}"
: "${BASICAUTH_USER:=ci}"
: "${BASICAUTH_PASSWORD:=ci-password-1234}"
# TODO: drop these defaults once layered env files + a committed base .env exist.
: "${IMAGE_NAME:=remdo-test}"

remdo_load_env_defaults "${ROOT_DIR}"

PORT="${DOCKER_TEST_PORT}"

CONTAINER_NAME="${IMAGE_NAME}-${PORT}"
HEALTH_URL="http://127.0.0.1:${PORT}/health"
# TODO: use layered env files (e.g. .env.dev) once supported.
ENV_FILE="${ROOT_DIR}/.env"

cleanup() {
  docker rm -f "${CONTAINER_NAME}" >/dev/null 2>&1 || true
  if [[ "${CLEAN_DATA_DIR}" == "true" ]]; then
    rm -rf "${DATA_DIR}"
  fi
}
trap cleanup EXIT

remdo_docker_build "${ROOT_DIR}" "${IMAGE_NAME}"

remdo_docker_run "${IMAGE_NAME}" -d --name "${CONTAINER_NAME}" --env-file "${ENV_FILE}" \
  -e BASICAUTH_USER="${BASICAUTH_USER}" \
  -e BASICAUTH_PASSWORD="${BASICAUTH_PASSWORD}" \
  -e PORT="${PORT}"

health_ready="false"
for _ in {1..20}; do
  if curl -fsS -u "${BASICAUTH_USER}:${BASICAUTH_PASSWORD}" "${HEALTH_URL}" >/dev/null; then
    health_ready="true"
    break
  fi
  sleep 0.5
done

if [[ "${health_ready}" != "true" ]]; then
  docker logs "${CONTAINER_NAME}" || true
  echo "Smoke test failed: ${HEALTH_URL}" >&2
  exit 1
fi

echo "Docker health check OK: ${HEALTH_URL}"
echo "Running Playwright smoke against Docker server..."

if ! E2E_DOCKER=true \
  HOST="127.0.0.1" \
  PORT="${PORT}" \
  BASICAUTH_USER="${BASICAUTH_USER}" \
  BASICAUTH_PASSWORD="${BASICAUTH_PASSWORD}" \
  pnpm run test:e2e -- tests/e2e/smoke.spec.ts; then
  docker logs "${CONTAINER_NAME}" || true
  echo "Smoke e2e failed: ${HEALTH_URL}" >&2
  exit 1
fi

echo "Docker smoke e2e OK: ${HEALTH_URL}"
