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
COLLAB_DOCUMENT_ID="docker-smoke"

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

docker rm -f "${CONTAINER_NAME}" >/dev/null 2>&1 || true

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
echo "Running Playwright editor smoke against Docker server..."

if ! E2E_DOCKER=true \
  NODE_ENV=production \
  HOST="127.0.0.1" \
  PORT="${PORT}" \
  COLLAB_ENABLED=true \
  BASICAUTH_USER="${BASICAUTH_USER}" \
  BASICAUTH_PASSWORD="${BASICAUTH_PASSWORD}" \
  pnpm exec playwright test -- tests/e2e/editor/docker/smoke.spec.ts; then
  docker logs "${CONTAINER_NAME}" || true
  echo "Smoke e2e failed: ${HEALTH_URL}" >&2
  exit 1
fi

echo "Docker smoke e2e OK: ${HEALTH_URL}"
COLLAB_DATA_PATH="${DATA_DIR%/}/collab/${COLLAB_DOCUMENT_ID}/data.ysweet"
collab_ready="false"
for _ in {1..40}; do
  if [[ -f "${COLLAB_DATA_PATH}" ]]; then
    collab_ready="true"
    break
  fi
  sleep 0.25
done

if [[ "${collab_ready}" != "true" ]]; then
  docker logs "${CONTAINER_NAME}" || true
  echo "Collab data missing: ${COLLAB_DATA_PATH}" >&2
  exit 1
fi

echo "Running Docker backup..."

if ! docker exec -e HOST="127.0.0.1" -e COLLAB_DOCUMENT_ID="${COLLAB_DOCUMENT_ID}" \
  "${CONTAINER_NAME}" /usr/local/bin/backup.sh; then
  docker logs "${CONTAINER_NAME}" || true
  echo "Backup failed: ${HEALTH_URL}" >&2
  exit 1
fi

BACKUP_DIR="${DATA_DIR%/}/backup"
MAIN_JSON="${BACKUP_DIR}/${COLLAB_DOCUMENT_ID}.json"
MAIN_MD="${BACKUP_DIR}/${COLLAB_DOCUMENT_ID}.md"
PROJECT_JSON="${BACKUP_DIR}/project.json"
PROJECT_MD="${BACKUP_DIR}/project.md"

for backup_file in "${MAIN_JSON}" "${MAIN_MD}" "${PROJECT_JSON}" "${PROJECT_MD}"; do
  if [[ ! -s "${backup_file}" ]]; then
    docker logs "${CONTAINER_NAME}" || true
    echo "Backup output missing or empty: ${backup_file}" >&2
    exit 1
  fi
done

for expected in "note1" "note2" "note3"; do
  if ! rg -q "${expected}" "${MAIN_JSON}"; then
    docker logs "${CONTAINER_NAME}" || true
    echo "Backup JSON missing expected content (${expected}): ${MAIN_JSON}" >&2
    exit 1
  fi
  if ! rg -q "${expected}" "${MAIN_MD}"; then
    docker logs "${CONTAINER_NAME}" || true
    echo "Backup markdown missing expected content (${expected}): ${MAIN_MD}" >&2
    exit 1
  fi
done

echo "Docker backup OK: ${BACKUP_DIR}"
