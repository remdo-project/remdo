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
export DOCKER_TEST_CONTAINER="${IMAGE_NAME}-$((PORT_BASE + 7))"
export DOCKER_TEST_ORIGIN="https://remdo.localhost:$((PORT_BASE + 7))"
export DOCKER_HOSTED_CONTAINER="${IMAGE_NAME}-$((PORT_BASE + 10))"
export DOCKER_HOSTED_PORT="$((PORT_BASE + 10))"
S3_CONTAINER="${IMAGE_NAME}-$((PORT_BASE + 10))-s3"
remdo_assert_browser_safe_port "$((PORT_BASE + 7))"
remdo_docker_build "${ROOT_DIR}" "${IMAGE_NAME}"
cleanup() {
  docker logs "${DOCKER_TEST_CONTAINER}" > "${TEST_DATA_DIR}/container.log" 2>&1 || true
  docker logs "${DOCKER_HOSTED_CONTAINER}" > "${TEST_DATA_DIR}/hosted.log" 2>&1 || true
  docker logs "${S3_CONTAINER}" > "${TEST_DATA_DIR}/s3.log" 2>&1 || true
  docker rm -f "${DOCKER_TEST_CONTAINER}" "${DOCKER_HOSTED_CONTAINER}" "${S3_CONTAINER}" >/dev/null 2>&1 || true
}
trap cleanup EXIT INT TERM
mkdir -p "${TEST_DATA_DIR}"
# Each run creates fresh accounts; retained previous output remains available until this point.
docker run --rm -v "${TEST_DATA_DIR}:/data" --entrypoint python "${IMAGE_NAME}" -c '
import shutil
for name in ("home", "hosted"):
    shutil.rmtree("/data/" + name, ignore_errors=True)
'
remdo_docker_run "${IMAGE_NAME}" "${TEST_DATA_DIR}/home" -d --userns=host \
  --name "${DOCKER_TEST_CONTAINER}" -p "127.0.0.1:$((PORT_BASE + 7)):$((PORT_BASE + 7))" \
  -e APP_ORIGIN="${DOCKER_TEST_ORIGIN}"
docker run -d --name "${S3_CONTAINER}" --network "${PG_NETWORK}" --network-alias s3 \
  -e COM_ADOBE_TESTING_S3MOCK_STORE_INITIAL_BUCKETS=remdo \
  adobe/s3mock:5.2.2 >/dev/null
# Wait for the bucket before Y-Sweet's startup check; no host S3 port is exposed.
docker run --rm --network "${PG_NETWORK}" --entrypoint python "${IMAGE_NAME}" -c '
import time, urllib.request
for attempt in range(60):
    try:
        with urllib.request.urlopen(urllib.request.Request("http://s3:9090/remdo", method="HEAD"), timeout=1):
            break
    except OSError:
        if attempt == 59:
            raise
        time.sleep(1)
'
remdo_docker_run "${IMAGE_NAME}" "${TEST_DATA_DIR}/hosted" -d --userns=host \
  --name "${DOCKER_HOSTED_CONTAINER}" -p "127.0.0.1:${DOCKER_HOSTED_PORT}:8080" \
  -e PORT=8080 -e APP_ORIGIN=https://remdo.onrender.com --network "${PG_NETWORK}" \
  -e DATABASE_URL="${DOCKER_DATABASE_URL%/remdo}/hosted" \
  -e Y_SWEET_STORE=s3://remdo/hosted \
  -e AWS_ACCESS_KEY_ID=fixture -e AWS_SECRET_ACCESS_KEY=fixture \
  -e AWS_REGION=us-east-1 -e AWS_ENDPOINT_URL_S3=http://s3:9090 -e AWS_S3_USE_PATH_STYLE=true
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
