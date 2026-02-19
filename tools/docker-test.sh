#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd -- "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck disable=SC1091 # shared helper lives in the repo.
. "${ROOT_DIR}/tools/lib/docker.sh"
remdo_load_dotenv "${ROOT_DIR}"
TEST_DATA_DIR="$(mktemp -d -t remdo-docker-test-XXXXXX)"

: "${PORT:=4000}"
: "${DOCKER_TEST_APP_HOST:=app.remdo.localhost}"
# TODO: drop these defaults once layered env files + a committed base .env exist.
: "${IMAGE_NAME:=remdo-test}"
DOCKER_TEST_USER="ci"
DOCKER_TEST_PASSWORD="ci-password-1234"

remdo_load_env_defaults "${ROOT_DIR}"

PORT="${DOCKER_TEST_PORT}"
COLLAB_DOCUMENT_ID="dockerSmoke"
# Keep smoke auth routing tied to the active test port, regardless of ambient .env values.
TINYAUTH_APP_URL="${DOCKER_TEST_TINYAUTH_APP_URL:-http://${DOCKER_TEST_APP_HOST}:${PORT}}"

CONTAINER_NAME="${IMAGE_NAME}-${PORT}"
HEALTH_URL="http://127.0.0.1:${PORT}/health"
DATA_CLEANED="false"

cleanup_data_dir() {
  if [[ "${DATA_CLEANED}" == "true" ]]; then
    return
  fi

  if ! docker exec "${CONTAINER_NAME}" sh -c 'rm -rf /app/data/* /app/data/.[!.]* /app/data/..?*' \
    >/dev/null 2>&1; then
    if docker image inspect "${IMAGE_NAME}" >/dev/null 2>&1; then
      docker run --rm -v "${TEST_DATA_DIR}:/app/data" "${IMAGE_NAME}" \
        sh -c 'rm -rf /app/data/* /app/data/.[!.]* /app/data/..?*' >/dev/null 2>&1 || true
    fi
  fi

  rm -rf "${TEST_DATA_DIR}" >/dev/null 2>&1 || true
  DATA_CLEANED="true"
}

cleanup() {
  cleanup_data_dir
  docker rm -f "${CONTAINER_NAME}" >/dev/null 2>&1 || true
}
trap cleanup EXIT

docker rm -f "${CONTAINER_NAME}" >/dev/null 2>&1 || true

remdo_docker_build "${ROOT_DIR}" "${IMAGE_NAME}"

remdo_docker_run "${IMAGE_NAME}" "${TEST_DATA_DIR}" -d --name "${CONTAINER_NAME}" \
  -e AUTH_USER="${DOCKER_TEST_USER}" \
  -e AUTH_PASSWORD="${DOCKER_TEST_PASSWORD}" \
  -e TINYAUTH_APP_URL="${TINYAUTH_APP_URL}" \
  -e PORT="${PORT}"

health_ready="false"
for _ in {1..20}; do
  if curl -fsS "${HEALTH_URL}" >/dev/null; then
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
  HOST="${DOCKER_TEST_APP_HOST}" \
  PORT="${PORT}" \
  COLLAB_ENABLED=true \
  AUTH_USER="${DOCKER_TEST_USER}" \
  AUTH_PASSWORD="${DOCKER_TEST_PASSWORD}" \
  pnpm exec playwright test -- tests/e2e/editor/docker/smoke.spec.ts; then
  docker logs "${CONTAINER_NAME}" || true
  echo "Smoke e2e failed: ${HEALTH_URL}" >&2
  exit 1
fi

echo "Docker smoke e2e OK: ${HEALTH_URL}"
COLLAB_DATA_PATH="${TEST_DATA_DIR%/}/collab/${COLLAB_DOCUMENT_ID}/data.ysweet"
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

BACKUP_DIR="${TEST_DATA_DIR%/}/backup"
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

check_backup_contains() {
  local expected="$1"
  local target_file="$2"
  local label="$3"

  if grep -Fq -- "${expected}" "${target_file}"; then
    return 0
  fi

  local status=$?
  if [[ "${status}" -eq 1 ]]; then
    echo "Backup ${label} missing expected content (${expected}): ${target_file}" >&2
    return 1
  fi

  echo "grep failed (${status}) while checking ${target_file}" >&2
  return "${status}"
}

for expected in "note1" "note2" "note3"; do
  if ! check_backup_contains "${expected}" "${MAIN_JSON}" "JSON"; then
    docker logs "${CONTAINER_NAME}" || true
    exit 1
  fi
  if ! check_backup_contains "${expected}" "${MAIN_MD}" "markdown"; then
    docker logs "${CONTAINER_NAME}" || true
    exit 1
  fi
done

echo "Docker backup OK: ${BACKUP_DIR}"
cleanup_data_dir
