#!/usr/bin/env bash
set -euo pipefail
ROOT_DIR="$(cd -- "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck disable=SC1091
. "${ROOT_DIR}/tools/lib/docker.sh"
remdo_load_dotenv "${ROOT_DIR}"
remdo_load_env_defaults "${ROOT_DIR}" development
POSTGRES_PORT="$((PORT_BASE + 9))"
export POSTGRES_PORT
if [ -z "${PG_RUNTIME:-}" ]; then
  exec "${ROOT_DIR}/tools/postgres.sh" run "$0" "$@"
fi
docker exec "${PG_RUNTIME}" createdb -U remdo hosted
: "${IMAGE_NAME:=remdo-test}"
TEST_DATA_DIR="${ROOT_DIR}/data/docker-test-runtime"
export DOCKER_TEST_CONTAINER="remdo-$((PORT_BASE + 7))"
export DOCKER_TEST_ORIGIN="https://remdo.localhost:$((PORT_BASE + 7))"
export DOCKER_HOSTED_CONTAINER="${IMAGE_NAME}-$((PORT_BASE + 10))"
export DOCKER_HOSTED_PORT="$((PORT_BASE + 10))"
# Both ports serve a Chromium baseURL, so an unsafe value must fail here rather
# than as an opaque net error inside the suite.
remdo_assert_browser_safe_port "$((PORT_BASE + 7))"
remdo_assert_browser_safe_port "$((PORT_BASE + 10))"
# The production launcher replaces its named container; tests must own that name.
if docker container inspect "${DOCKER_TEST_CONTAINER}" >/dev/null 2>&1; then
  echo "Container ${DOCKER_TEST_CONTAINER} already exists; choose another PORT_BASE." >&2
  exit 1
fi
remdo_docker_build "${ROOT_DIR}" "${IMAGE_NAME}"
cleanup() {
  docker logs "${DOCKER_TEST_CONTAINER}" > "${TEST_DATA_DIR}/container.log" 2>&1 || true
  docker logs "${DOCKER_HOSTED_CONTAINER}" > "${TEST_DATA_DIR}/hosted.log" 2>&1 || true
  docker rm -f "${DOCKER_TEST_CONTAINER}" "${DOCKER_HOSTED_CONTAINER}" >/dev/null 2>&1 || true
}
trap cleanup EXIT INT TERM
install -d -m 700 "${TEST_DATA_DIR}"
# Each run creates fresh accounts; retained previous output remains available until this point.
docker run --rm -v "${TEST_DATA_DIR}:/data" --entrypoint python "${IMAGE_NAME}" -c '
import shutil
for name in ("home", "hosted"):
    shutil.rmtree("/data/" + name, ignore_errors=True)
'
IMAGE_NAME="${IMAGE_NAME}" DATA_DIR="${TEST_DATA_DIR}/home" \
  APP_ORIGIN="${DOCKER_TEST_ORIGIN}" HOST=127.0.0.1 DATABASE_URL= \
  REMDO_ADMIN_PASSWORD= \
  "${ROOT_DIR}/tools/prod/docker.sh"
remdo_docker_run "${IMAGE_NAME}" "${TEST_DATA_DIR}/hosted" -d --userns=host \
  --name "${DOCKER_HOSTED_CONTAINER}" -p "127.0.0.1:${DOCKER_HOSTED_PORT}:8080" \
  -e PORT=8080 -e RENDER=true -e APP_ORIGIN=https://remdo.onrender.com --network "${PG_NETWORK}" \
  -e DATABASE_URL="${DOCKER_DATABASE_URL%/remdo}/hosted"
cd "${ROOT_DIR}"
PLAYWRIGHT_BROWSERS_DIR="${PLAYWRIGHT_BROWSERS_PATH:-}"
if [[ -n "${PLAYWRIGHT_BROWSERS_DIR}" ]]; then
  mkdir -p "${PLAYWRIGHT_BROWSERS_DIR}" >/dev/null 2>&1 || true
fi
if [[ -z "${PLAYWRIGHT_BROWSERS_DIR}" || ! -w "${PLAYWRIGHT_BROWSERS_DIR}" ]]; then
  PLAYWRIGHT_BROWSERS_DIR="${ROOT_DIR}/data/cache/playwright-browsers"
  mkdir -p "${PLAYWRIGHT_BROWSERS_DIR}"
fi
export PLAYWRIGHT_BROWSERS_PATH="${PLAYWRIGHT_BROWSERS_DIR}"
pnpm exec playwright install chromium
pnpm exec playwright test --config playwright.docker.config.ts "$@"
