#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd -- "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck disable=SC1091 # shared helper lives in the repo.
. "${ROOT_DIR}/tools/lib/docker.sh"
remdo_load_dotenv "${ROOT_DIR}"
: "${DOCKER_TEST_BROWSER_HOST:=remdo.localhost}"
: "${IMAGE_NAME:=remdo-test}"
DOCKER_TEST_SECRET="ci-better-auth-secret-0123456789"
DOCKER_TEST_ADMIN_SECRET="ci-admin-secret-0123456789"
DOCKER_TEST_YSWEET_AUTH_KEY="WLo8wx1G1lGKpIDaDjky9npTrV_fW8jCpRVtB8rd"
DOCKER_TEST_YSWEET_SERVER_TOKEN="AAAgOkIiPro6W2lCzxyW6BDQkuOmTVSfs0MZh-4PGTM_st0"

TEST_DATA_DIR="$(mktemp -d -t remdo-docker-test-XXXXXX)"
DOCKER_E2E_AUTH_STATE_PATH="${TEST_DATA_DIR%/}/docker-e2e-auth-state.json"
DOCKER_E2E_SMOKE_DOCUMENT_ID_PATH="${TEST_DATA_DIR%/}/docker-e2e-smoke-document-id.txt"
DOCKER_HOME_DATA_DIR="${TEST_DATA_DIR%/}/home"
SOURCE_DATA_DIR="${TEST_DATA_DIR%/}/source"
SOURCE_PORT_SHIFT=70

remdo_load_env_defaults "${ROOT_DIR}"
# The containerized gateway runs on PORT_BASE+7 and the standalone source dev
# server on a separate PORT_BASE+70 range. PORT is the single bind input now, so
# pin the gateway port directly and re-validate it as browser-facing.
PORT="$((PORT_BASE + 7))"
remdo_assert_browser_safe_port "${PORT}"
APP_PUBLIC_URL="http://${DOCKER_TEST_BROWSER_HOST}:${PORT}"

SOURCE_PORT="$((PORT_BASE + SOURCE_PORT_SHIFT))"
SOURCE_COLLAB_SERVER_PORT="$((PORT_BASE + SOURCE_PORT_SHIFT + 4))"
SOURCE_YSWEET_CONNECTION_STRING="ys://127.0.0.1:${SOURCE_COLLAB_SERVER_PORT}"
SOURCE_ORIGIN="http://localhost:${SOURCE_PORT}"
source_token_host="$(ip -4 route get 1.1.1.1 | sed -n 's/.* src \([0-9.]*\).*/\1/p')"
if [[ -z "${source_token_host}" ]]; then
  echo "Failed to detect a source token host address." >&2
  exit 1
fi
SOURCE_TOKEN_ORIGIN="http://${source_token_host}:${SOURCE_PORT}"
LINKABLE_REMDO_SERVERS_JSON='[{"id":"source","label":"Local dev server","baseUrl":"'"${SOURCE_ORIGIN}"'","tokenBaseUrl":"'"${SOURCE_TOKEN_ORIGIN}"'","clientId":"'"${REMDO_DEV_OAUTH_CLIENT_ID}"'","clientSecret":"'"${REMDO_DEV_OAUTH_CLIENT_SECRET}"'"}]'

CONTAINER_NAME="${IMAGE_NAME}-${PORT}"
HEALTH_URL="${APP_PUBLIC_URL%/}/health"
DATA_CLEANED="false"
DOCKER_RUN_ARGS=()

if remdo_docker_daemon_is_rootless; then
  DOCKER_RUN_ARGS+=(--userns=host)
fi

cleanup_data_dir() {
  if [[ "${DATA_CLEANED}" == "true" ]]; then
    return
  fi

  if ! docker exec "${CONTAINER_NAME}" sh -c 'rm -rf /app/data/* /app/data/.[!.]* /app/data/..?*' \
    >/dev/null 2>&1; then
    if docker image inspect "${IMAGE_NAME}" >/dev/null 2>&1; then
      docker run --rm "${DOCKER_RUN_ARGS[@]}" -v "${DOCKER_HOME_DATA_DIR}:/app/data" "${IMAGE_NAME}" \
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

echo "Provisioning source OAuth client for ${APP_PUBLIC_URL}..."
env \
  AUTH_URL="${SOURCE_ORIGIN}" \
  DATA_DIR="${SOURCE_DATA_DIR}" \
  PORT="${SOURCE_PORT}" \
  REMDO_DEV_HOME_ORIGIN="${APP_PUBLIC_URL}" \
  pnpm run dev:users

remdo_docker_build "${ROOT_DIR}" "${IMAGE_NAME}"

remdo_docker_run "${IMAGE_NAME}" "${DOCKER_HOME_DATA_DIR}" -d --name "${CONTAINER_NAME}" "${DOCKER_RUN_ARGS[@]}" \
  -e AUTH_SECRET="${DOCKER_TEST_SECRET}" \
  -e ADMIN_SECRET="${DOCKER_TEST_ADMIN_SECRET}" \
  -e YSWEET_AUTH_KEY="${DOCKER_TEST_YSWEET_AUTH_KEY}" \
  -e YSWEET_SERVER_TOKEN="${DOCKER_TEST_YSWEET_SERVER_TOKEN}" \
  -e APP_PUBLIC_URL="${APP_PUBLIC_URL}" \
  -e HOST=127.0.0.1 \
  -e PORT_BASE="${PORT_BASE}" \
  -e PORT="${PORT}" \
  -e LINKABLE_REMDO_SERVERS_JSON="${LINKABLE_REMDO_SERVERS_JSON}"

health_ready="false"
for _ in {1..20}; do
  if curl --resolve "${DOCKER_TEST_BROWSER_HOST}:${PORT}:127.0.0.1" -kfsS "${HEALTH_URL}" >/dev/null 2>&1; then
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
echo "Running Playwright Docker E2E suite..."

PLAYWRIGHT_BROWSERS_DIR="${PLAYWRIGHT_BROWSERS_PATH:-}"
if [[ -n "${PLAYWRIGHT_BROWSERS_DIR}" ]]; then
  mkdir -p "${PLAYWRIGHT_BROWSERS_DIR}" >/dev/null 2>&1 || true
fi
if [[ -z "${PLAYWRIGHT_BROWSERS_DIR}" || ! -w "${PLAYWRIGHT_BROWSERS_DIR}" ]]; then
  PLAYWRIGHT_BROWSERS_DIR="${ROOT_DIR%/}/data/cache/playwright-browsers"
  mkdir -p "${PLAYWRIGHT_BROWSERS_DIR}"
fi

echo "Ensuring Playwright Chromium is installed (${PLAYWRIGHT_BROWSERS_DIR})..."
PLAYWRIGHT_BROWSERS_PATH="${PLAYWRIGHT_BROWSERS_DIR}" pnpm exec playwright install chromium

PLAYWRIGHT_ENV=(
  PLAYWRIGHT_BROWSERS_PATH="${PLAYWRIGHT_BROWSERS_DIR}"
  APP_PUBLIC_URL="${APP_PUBLIC_URL}"
  ADMIN_SECRET="${DOCKER_TEST_ADMIN_SECRET}"
  YSWEET_SERVER_TOKEN="${DOCKER_TEST_YSWEET_SERVER_TOKEN}"
)

if ! env "${PLAYWRIGHT_ENV[@]}" \
  DATA_DIR="${SOURCE_DATA_DIR}" \
  HOST=0.0.0.0 \
  PORT_BASE="$((PORT_BASE + SOURCE_PORT_SHIFT))" \
  YSWEET_CONNECTION_STRING="${SOURCE_YSWEET_CONNECTION_STRING}" \
  E2E_WRITE_STORAGE_STATE="${DOCKER_E2E_AUTH_STATE_PATH}" \
  E2E_STORAGE_STATE="${DOCKER_E2E_AUTH_STATE_PATH}" \
  E2E_WRITE_SMOKE_DOCUMENT_ID="${DOCKER_E2E_SMOKE_DOCUMENT_ID_PATH}" \
  E2E_SMOKE_DOCUMENT_ID="${DOCKER_E2E_SMOKE_DOCUMENT_ID_PATH}" \
  "${ROOT_DIR}/tools/env.sh" timeout "${TEST_TIMEOUT:-300}s" \
  pnpm exec playwright test --config playwright.docker.config.ts; then
  docker logs "${CONTAINER_NAME}" || true
  echo "Docker e2e failed: ${HEALTH_URL}" >&2
  exit 1
fi

if [[ ! -s "${DOCKER_E2E_AUTH_STATE_PATH}" ]]; then
  docker logs "${CONTAINER_NAME}" || true
  echo "Docker e2e did not write auth state: ${DOCKER_E2E_AUTH_STATE_PATH}" >&2
  exit 1
fi

if [[ ! -s "${DOCKER_E2E_SMOKE_DOCUMENT_ID_PATH}" ]]; then
  docker logs "${CONTAINER_NAME}" || true
  echo "Docker e2e did not write smoke document id: ${DOCKER_E2E_SMOKE_DOCUMENT_ID_PATH}" >&2
  exit 1
fi

echo "Docker e2e OK: ${HEALTH_URL}"
DEV_DOCUMENT_ID="$(tr -d '\r\n' < "${DOCKER_E2E_SMOKE_DOCUMENT_ID_PATH}")"
COLLAB_DATA_PATH="${DOCKER_HOME_DATA_DIR%/}/collab/${DEV_DOCUMENT_ID}/data.ysweet"
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

if ! docker exec -e HOST="127.0.0.1" -e DEV_DOCUMENT_ID="${DEV_DOCUMENT_ID}" \
  "${CONTAINER_NAME}" /usr/local/bin/backup.sh; then
  docker logs "${CONTAINER_NAME}" || true
  echo "Backup failed: ${HEALTH_URL}" >&2
  exit 1
fi

BACKUP_DIR="${DOCKER_HOME_DATA_DIR%/}/backup"
BACKUP_SQLITE="${BACKUP_DIR}/remdo.sqlite"
BACKUP_INDEX="${BACKUP_DIR}/documents/index.json"
DEV_DOCUMENT_JSON="${BACKUP_DIR}/documents/${DEV_DOCUMENT_ID}.json"
DEV_DOCUMENT_MD="${BACKUP_DIR}/documents/${DEV_DOCUMENT_ID}.md"
backup_files=("${BACKUP_SQLITE}" "${BACKUP_INDEX}" "${DEV_DOCUMENT_JSON}" "${DEV_DOCUMENT_MD}")

backup_ready="false"
for _ in {1..80}; do
  backup_ready="true"
  for backup_file in "${backup_files[@]}"; do
    if [[ ! -s "${backup_file}" ]]; then
      backup_ready="false"
      break
    fi
  done
  if [[ "${backup_ready}" == "true" ]]; then
    break
  fi
  sleep 0.25
done

for backup_file in "${backup_files[@]}"; do
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

if ! check_backup_contains "${DEV_DOCUMENT_ID}" "${BACKUP_INDEX}" "index"; then
  docker logs "${CONTAINER_NAME}" || true
  exit 1
fi

for expected in "note1" "note2" "note3"; do
  if ! check_backup_contains "${expected}" "${DEV_DOCUMENT_JSON}" "JSON"; then
    docker logs "${CONTAINER_NAME}" || true
    exit 1
  fi
  if ! check_backup_contains "${expected}" "${DEV_DOCUMENT_MD}" "markdown"; then
    docker logs "${CONTAINER_NAME}" || true
    exit 1
  fi
done

echo "Docker backup OK: ${BACKUP_DIR}"
cleanup_data_dir
