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
HOME_INTERNAL_PORT_SHIFT=50
BOOTSTRAP_INTERNAL_PORT_SHIFT=60

remdo_load_env_defaults "${ROOT_DIR}"
# The containerized gateway runs on PORT_BASE+7 and the standalone source dev
# server on a separate PORT_BASE+70 range. PORT is the single bind input now, so
# pin the gateway port directly and re-validate it as browser-facing.
PORT="$((PORT_BASE + 7))"
remdo_assert_browser_safe_port "${PORT}"
APP_PUBLIC_URL="http://${DOCKER_TEST_BROWSER_HOST}:${PORT}"

# The source dev server binds PORT_BASE+0 of its shifted range, so its origin
# port equals the shifted base.
SOURCE_PORT_BASE="$((PORT_BASE + SOURCE_PORT_SHIFT))"
SOURCE_ORIGIN="http://localhost:${SOURCE_PORT_BASE}"

CONTAINER_NAME="${IMAGE_NAME}-${PORT}"
HEALTH_URL="${APP_PUBLIC_URL%/}/health"
DATA_CLEANED="false"
DOCKER_RUN_ARGS=()

# Second scenario: a fresh, ADMIN_SECRET-only container that forces the
# in-container bootstrap-secrets.ts to GENERATE and PERSIST AUTH_SECRET and the
# Y-Sweet pair. Distinct port (PORT_BASE+8) so it cannot collide with the main
# gateway (PORT_BASE+7) or the source dev range (PORT_BASE+70). Its data dir is a
# fresh empty mount so the persistence guard does not fire on first boot.
BOOTSTRAP_PORT="$((PORT_BASE + 8))"
remdo_assert_browser_safe_port "${BOOTSTRAP_PORT}"
BOOTSTRAP_CONTAINER_NAME="${IMAGE_NAME}-${BOOTSTRAP_PORT}"
BOOTSTRAP_APP_PUBLIC_URL="http://${DOCKER_TEST_BROWSER_HOST}:${BOOTSTRAP_PORT}"
BOOTSTRAP_HEALTH_URL="${BOOTSTRAP_APP_PUBLIC_URL%/}/health"
BOOTSTRAP_DATA_DIR="${TEST_DATA_DIR%/}/bootstrap-home"

# Third scenario: the real production launcher with its bridge publication.
# It uses the next reserved Docker E2E port and a separate container/data dir.
PROD_BRIDGE_PORT="$((PORT_BASE + 9))"
remdo_assert_browser_safe_port "${PROD_BRIDGE_PORT}"
PROD_BRIDGE_CONTAINER_NAME="${IMAGE_NAME}-${PROD_BRIDGE_PORT}"
PROD_BRIDGE_APP_PUBLIC_URL="http://${DOCKER_TEST_BROWSER_HOST}:${PROD_BRIDGE_PORT}"
PROD_BRIDGE_HEALTH_URL="${PROD_BRIDGE_APP_PUBLIC_URL%/}/health"
PROD_BRIDGE_DATA_DIR="${TEST_DATA_DIR%/}/prod-bridge-home"
PROD_BRIDGE_LAUNCH_LOG="${TEST_DATA_DIR%/}/prod-bridge-launcher.log"
PROD_BRIDGE_LAUNCH_PID=""

if remdo_docker_daemon_is_rootless; then
  remdo_require_rootless_host_network
  DOCKER_RUN_ARGS+=(--userns=host)
fi
DOCKER_RUN_ARGS+=(--network=host)

# Wipe a host-mounted data dir from inside the container so container-owned
# (often root-owned, on a rootful daemon) files are removed by a process with the
# right uid; fall back to a throwaway container if the live one is already gone.
wipe_container_data() {
  local container_name="$1"
  local host_data_dir="$2"

  if docker exec "${container_name}" sh -c 'rm -rf /data/* /data/.[!.]* /data/..?*' \
    >/dev/null 2>&1; then
    return
  fi
  if docker image inspect "${IMAGE_NAME}" >/dev/null 2>&1; then
    docker run --rm "${DOCKER_RUN_ARGS[@]}" -v "${host_data_dir}:/data" "${IMAGE_NAME}" \
      sh -c 'rm -rf /data/* /data/.[!.]* /data/..?*' >/dev/null 2>&1 || true
  fi
}

cleanup_data_dir() {
  if [[ "${DATA_CLEANED}" == "true" ]]; then
    return
  fi

  wipe_container_data "${CONTAINER_NAME}" "${DOCKER_HOME_DATA_DIR}"
  wipe_container_data "${BOOTSTRAP_CONTAINER_NAME}" "${BOOTSTRAP_DATA_DIR}"
  wipe_container_data "${PROD_BRIDGE_CONTAINER_NAME}" "${PROD_BRIDGE_DATA_DIR}"

  rm -rf "${TEST_DATA_DIR}" >/dev/null 2>&1 || true
  DATA_CLEANED="true"
}

stop_prod_bridge_launcher() {
  if [[ -n "${PROD_BRIDGE_LAUNCH_PID}" ]]; then
    kill -KILL -- "-${PROD_BRIDGE_LAUNCH_PID}" >/dev/null 2>&1 \
      || kill -KILL "${PROD_BRIDGE_LAUNCH_PID}" >/dev/null 2>&1 \
      || true
  fi
  docker rm -f "${PROD_BRIDGE_CONTAINER_NAME}" >/dev/null 2>&1 || true
  if [[ -n "${PROD_BRIDGE_LAUNCH_PID}" ]]; then
    wait "${PROD_BRIDGE_LAUNCH_PID}" >/dev/null 2>&1 || true
    PROD_BRIDGE_LAUNCH_PID=""
  fi
}

cleanup() {
  stop_prod_bridge_launcher
  cleanup_data_dir
  docker rm -f "${CONTAINER_NAME}" >/dev/null 2>&1 || true
  docker rm -f "${BOOTSTRAP_CONTAINER_NAME}" >/dev/null 2>&1 || true
}
trap cleanup EXIT

wait_healthy() {
  local port="$1"
  local url="$2"
  local attempts="$3"
  local process_id="${4:-}"
  local attempt

  for ((attempt = 0; attempt < attempts; attempt += 1)); do
    if curl --resolve "${DOCKER_TEST_BROWSER_HOST}:${port}:127.0.0.1" \
      -kfsS "${url}" >/dev/null 2>&1; then
      return 0
    fi
    if [[ -n "${process_id}" ]] && ! kill -0 "${process_id}" >/dev/null 2>&1; then
      return 1
    fi
    sleep 0.5
  done
  return 1
}

assert_loopback_gateway() {
  local container_name="$1"
  local port="$2"

  # Validate the adapted gateway rather than only the Caddyfile template: the
  # listener stays on loopback while the advertised hostname is a request
  # matcher, not an accidental site-address listener constraint.
  docker exec -e CADDY_CANONICAL_HOST="${DOCKER_TEST_BROWSER_HOST}" \
    "${container_name}" caddy adapt \
    --config /etc/caddy/Caddyfile --adapter caddyfile 2>/dev/null \
    | node -e '
        let input = "";
        process.stdin.setEncoding("utf8");
        process.stdin.on("data", (chunk) => { input += chunk; });
        process.stdin.on("end", () => {
          const config = JSON.parse(input);
          const servers = Object.values(config.apps?.http?.servers ?? {});
          const listeners = servers.flatMap((server) => server.listen ?? []);
          const expectedListener = process.argv[1];
          const expectedHost = process.argv[2];
          const hosts = [];
          const visit = (value) => {
            if (Array.isArray(value)) {
              value.forEach(visit);
            } else if (value && typeof value === "object") {
              if (Array.isArray(value.host)) hosts.push(...value.host);
              Object.values(value).forEach(visit);
            }
          };
          visit(config);
          if (!listeners.includes(expectedListener) || !hosts.includes(expectedHost)) {
            console.error({ expectedHost, expectedListener, hosts, listeners });
            process.exit(1);
          }
        });
      ' "127.0.0.1:${port}" "${DOCKER_TEST_BROWSER_HOST}"
}

docker rm -f "${CONTAINER_NAME}" >/dev/null 2>&1 || true
docker rm -f "${BOOTSTRAP_CONTAINER_NAME}" >/dev/null 2>&1 || true
docker rm -f "${PROD_BRIDGE_CONTAINER_NAME}" >/dev/null 2>&1 || true

remdo_docker_build "${ROOT_DIR}" "${IMAGE_NAME}"

remdo_docker_run "${IMAGE_NAME}" "${DOCKER_HOME_DATA_DIR}" -d --name "${CONTAINER_NAME}" "${DOCKER_RUN_ARGS[@]}" \
  -e AUTH_SECRET="${DOCKER_TEST_SECRET}" \
  -e ADMIN_SECRET="${DOCKER_TEST_ADMIN_SECRET}" \
  -e YSWEET_AUTH_KEY="${DOCKER_TEST_YSWEET_AUTH_KEY}" \
  -e YSWEET_SERVER_TOKEN="${DOCKER_TEST_YSWEET_SERVER_TOKEN}" \
  -e APP_PUBLIC_URL="${APP_PUBLIC_URL}" \
  -e CADDY_SITE_ADDRESSES="http://:${PORT}" \
  -e CADDY_BIND_DIRECTIVE="bind 127.0.0.1" \
  -e HOST=127.0.0.1 \
  -e PORT_BASE="$((PORT_BASE + HOME_INTERNAL_PORT_SHIFT))" \
  -e PORT="${PORT}"

if ! wait_healthy "${PORT}" "${HEALTH_URL}" 20; then
  docker logs "${CONTAINER_NAME}" || true
  echo "Smoke test failed: ${HEALTH_URL}" >&2
  exit 1
fi

echo "Docker health check OK: ${HEALTH_URL}"

assert_loopback_gateway "${CONTAINER_NAME}" "${PORT}"

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
  REMDO_E2E_HOME_ORIGIN="${APP_PUBLIC_URL}"
  ADMIN_SECRET="${DOCKER_TEST_ADMIN_SECRET}"
  YSWEET_SERVER_TOKEN="${DOCKER_TEST_YSWEET_SERVER_TOKEN}"
  REMDO_E2E_SOURCE_ORIGIN="${SOURCE_ORIGIN}"
)

if ! env \
  "${PLAYWRIGHT_ENV[@]}" \
  DATA_DIR="${SOURCE_DATA_DIR}" \
  HOST=localhost \
  PUBLIC_HOST=localhost \
  PORT_BASE="${SOURCE_PORT_BASE}" \
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

  # Capture grep's status directly: after a closed `if grep; then ...; fi` the
  # `$?` is the if-statement's exit (0), not grep's, which would mask a miss.
  local status=0
  grep -Fq -- "${expected}" "${target_file}" || status=$?
  if [[ "${status}" -eq 0 ]]; then
    return 0
  fi

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

# ---------------------------------------------------------------------------
# Scenario 2: ADMIN_SECRET-only bootstrap (secret generation + persistence).
#
# The main suite above passes every secret explicitly, exercising only the
# "env-provided" branch of tools/bootstrap-secrets.ts. This scenario closes the
# integration gap: it runs a fresh container with ONLY ADMIN_SECRET (no
# AUTH_SECRET, no Y-Sweet pair) against an empty data mount, so the entrypoint's
# bootstrap GENERATES and PERSISTS AUTH_SECRET and the Y-Sweet pair, then proves
# a restart reuses them without rotation and that the self-generated AUTH_SECRET
# drives a working app.
echo "Running ADMIN_SECRET-only bootstrap scenario on ${BOOTSTRAP_APP_PUBLIC_URL}..."

bootstrap_fail() {
  docker logs "${BOOTSTRAP_CONTAINER_NAME}" || true
  echo "ADMIN_SECRET-only bootstrap scenario failed: $1" >&2
  exit 1
}

# Set the distinct bootstrap gateway port. Pass ONLY ADMIN_SECRET
# (+ APP_PUBLIC_URL, HOST, PORT_BASE, PORT). AUTH_SECRET and the
# Y-Sweet pair are intentionally absent so the entrypoint bootstrap generates and
# persists them under the mounted /data/secrets.
PORT="${BOOTSTRAP_PORT}" remdo_docker_run "${IMAGE_NAME}" "${BOOTSTRAP_DATA_DIR}" \
  -d --name "${BOOTSTRAP_CONTAINER_NAME}" "${DOCKER_RUN_ARGS[@]}" \
  -e ADMIN_SECRET="${DOCKER_TEST_ADMIN_SECRET}" \
  -e APP_PUBLIC_URL="${BOOTSTRAP_APP_PUBLIC_URL}" \
  -e CADDY_SITE_ADDRESSES="http://:${BOOTSTRAP_PORT}" \
  -e CADDY_BIND_DIRECTIVE="bind 127.0.0.1" \
  -e HOST=127.0.0.1 \
  -e PORT_BASE="$((PORT_BASE + BOOTSTRAP_INTERNAL_PORT_SHIFT))" \
  -e PORT="${BOOTSTRAP_PORT}"

# (a) The ADMIN_SECRET-only container boots healthy.
if ! wait_healthy "${BOOTSTRAP_PORT}" "${BOOTSTRAP_HEALTH_URL}" 20; then
  bootstrap_fail "container did not become healthy at ${BOOTSTRAP_HEALTH_URL}"
fi
echo "Bootstrap scenario healthy: ${BOOTSTRAP_HEALTH_URL}"
assert_loopback_gateway "${BOOTSTRAP_CONTAINER_NAME}" "${BOOTSTRAP_PORT}"

# (b) The generated secret files exist with the expected restrictive modes. One
# `docker exec stat` over all targets (modes only, no secret values logged)
# yields "<path> <mode>" lines we assert against the expected map.
bootstrap_modes="$(docker exec "${BOOTSTRAP_CONTAINER_NAME}" \
  stat -c '%n %a' \
  /data/secrets \
  /data/secrets/auth-secret \
  /data/secrets/ysweet.json 2>/dev/null || true)"

assert_bootstrap_mode() {
  local target="$1"
  local expected="$2"
  local label="$3"
  local actual
  actual="$(awk -v t="${target}" '$1 == t { print $2 }' <<<"${bootstrap_modes}")"
  if [[ "${actual}" != "${expected}" ]]; then
    bootstrap_fail "${label} expected mode ${expected} but got '${actual}' (${target})"
  fi
}

assert_bootstrap_mode "/data/secrets" "700" "secrets dir"
assert_bootstrap_mode "/data/secrets/auth-secret" "600" "auth-secret file"
assert_bootstrap_mode "/data/secrets/ysweet.json" "600" "ysweet.json file"
echo "Bootstrap scenario generated secrets with 0700 dir / 0600 files."

# (c) Restart reuses the persisted secrets without rotation. Capture the file
# digests BEFORE restart (sha256 inside the container so secret values never
# leave it), restart with the SAME data dir, and assert the digests are
# unchanged AND the container still boots healthy (proving the persistence guard
# did NOT fire — a fired guard exits non-zero and the container would crash-loop
# instead of becoming healthy).
bootstrap_digests() {
  docker exec "${BOOTSTRAP_CONTAINER_NAME}" sh -c \
    'sha256sum /data/secrets/auth-secret /data/secrets/ysweet.json' 2>/dev/null \
    | awk '{ print $1 }'
}

digests_before="$(bootstrap_digests)"
if [[ -z "${digests_before}" ]]; then
  bootstrap_fail "could not read secret digests before restart"
fi

docker restart "${BOOTSTRAP_CONTAINER_NAME}" >/dev/null 2>&1 \
  || bootstrap_fail "docker restart failed"

if ! wait_healthy "${BOOTSTRAP_PORT}" "${BOOTSTRAP_HEALTH_URL}" 20; then
  bootstrap_fail "container did not become healthy after restart (persistence guard may have fired)"
fi

digests_after="$(bootstrap_digests)"
if [[ "${digests_before}" != "${digests_after}" ]]; then
  bootstrap_fail "secret files rotated across restart (expected reuse)"
fi
echo "Bootstrap scenario reused persisted secrets across restart (no rotation)."

# (d) Smoke: prove the self-generated AUTH_SECRET drives a working app.
#
# Choice: POST /api/admin/enroll with the ADMIN_SECRET. This is the lightest
# scriptable check that genuinely exercises the generated secret: the route
# authorizes with ADMIN_SECRET and then calls Better Auth's createUser, and
# Better Auth is initialized with the bootstrapped AUTH_SECRET. If AUTH_SECRET
# were missing or non-functional the container would not have started (the
# entrypoint asserts it) and user creation would not succeed, so a 2xx here
# proves ADMIN_SECRET + the generated AUTH_SECRET work end to end. We do not
# assert the generated Y-Sweet token value (the host cannot know it). Omitting
# the Origin header keeps Hono's CSRF middleware satisfied (it only rejects a
# present, mismatched Origin), matching how the Playwright API context provisions
# users.
bootstrap_smoke_status="$(curl --resolve "${DOCKER_TEST_BROWSER_HOST}:${BOOTSTRAP_PORT}:127.0.0.1" \
  -ksS -o /dev/null -w '%{http_code}' \
  -X POST "${BOOTSTRAP_APP_PUBLIC_URL%/}/api/admin/enroll" \
  -H 'content-type: application/json' \
  --data '{"adminSecret":"'"${DOCKER_TEST_ADMIN_SECRET}"'","name":"Bootstrap Smoke","email":"bootstrap-smoke@example.com","password":"bootstrap-smoke-password"}' \
  2>/dev/null || true)"

if [[ "${bootstrap_smoke_status}" != 2?? ]]; then
  bootstrap_fail "admin provisioning smoke returned HTTP ${bootstrap_smoke_status} (expected 2xx)"
fi
echo "Bootstrap scenario admin provisioning OK (HTTP ${bootstrap_smoke_status})."

docker rm -f "${BOOTSTRAP_CONTAINER_NAME}" >/dev/null 2>&1 || true
echo "ADMIN_SECRET-only bootstrap scenario OK."

# ---------------------------------------------------------------------------
# Scenario 3: production launcher bridge publication.
#
# The scenarios above invoke remdo_docker_run directly with host networking.
# This smoke invokes the operator-facing launcher itself and reaches the
# container through its published bridge port.
echo "Running production bridge launcher smoke on ${PROD_BRIDGE_APP_PUBLIC_URL}..."

# Keep the build and Docker launcher descendants terminable as one unit when
# startup fails before the named container exists.
setsid env \
  IMAGE_NAME="${IMAGE_NAME}" \
  REMDO_DOCKER_CONTAINER_NAME="${PROD_BRIDGE_CONTAINER_NAME}" \
  REMDO_DOCKER_NETWORK=bridge \
  DATA_DIR="${PROD_BRIDGE_DATA_DIR}" \
  PORT_BASE="${PORT_BASE}" \
  PORT="${PROD_BRIDGE_PORT}" \
  APP_PUBLIC_URL="${PROD_BRIDGE_APP_PUBLIC_URL}" \
  ADMIN_SECRET="${DOCKER_TEST_ADMIN_SECRET}" \
  AUTH_SECRET="${DOCKER_TEST_SECRET}" \
  YSWEET_AUTH_KEY="${DOCKER_TEST_YSWEET_AUTH_KEY}" \
  YSWEET_SERVER_TOKEN="${DOCKER_TEST_YSWEET_SERVER_TOKEN}" \
  ALLOW_SIGNUP=false \
  CADDY_SITE_ADDRESSES= \
  CADDY_BIND_DIRECTIVE= \
  "${ROOT_DIR}/tools/prod/docker.sh" >"${PROD_BRIDGE_LAUNCH_LOG}" 2>&1 &
PROD_BRIDGE_LAUNCH_PID="$!"

if ! wait_healthy \
  "${PROD_BRIDGE_PORT}" \
  "${PROD_BRIDGE_HEALTH_URL}" \
  40 \
  "${PROD_BRIDGE_LAUNCH_PID}"; then
  docker logs "${PROD_BRIDGE_CONTAINER_NAME}" || true
  tail -n 200 "${PROD_BRIDGE_LAUNCH_LOG}" >&2 || true
  echo "Production bridge launcher smoke failed: ${PROD_BRIDGE_HEALTH_URL}" >&2
  exit 1
fi

echo "Production bridge launcher smoke OK: ${PROD_BRIDGE_HEALTH_URL}"
stop_prod_bridge_launcher

cleanup_data_dir
