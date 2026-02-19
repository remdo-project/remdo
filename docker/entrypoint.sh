#!/usr/bin/env sh
set -euo pipefail

# Default to the writable runtime root inside the container.
: "${REMDO_ROOT:=/app}"
export REMDO_ROOT

# shellcheck disable=SC1091 # provided by the image build.
. /usr/local/share/remdo/env.defaults.sh

: "${AUTH_USER:?Set AUTH_USER to the username for Tinyauth login}"
: "${AUTH_PASSWORD:?Set AUTH_PASSWORD to the password for Tinyauth login}"
: "${TINYAUTH_APP_URL:?Set TINYAUTH_APP_URL to the public Tinyauth URL (for example http://app.remdo.localhost:4000)}"

app_url_scheme="${TINYAUTH_APP_URL%%://*}"
if [ -z "${app_url_scheme}" ] || [ "${app_url_scheme}" = "${TINYAUTH_APP_URL}" ]; then
  echo "Failed to parse scheme from TINYAUTH_APP_URL=${TINYAUTH_APP_URL}" >&2
  exit 1
fi
export TINYAUTH_APP_SCHEME="${app_url_scheme}"

TINYAUTH_USERS="$(
  NO_COLOR=1 tinyauth user create --username "${AUTH_USER}" --password "${AUTH_PASSWORD}" 2>&1 \
    | sed -n 's/.* user=//p' \
    | tail -n1
)"

if [ -z "${TINYAUTH_USERS}" ]; then
  echo "Failed to create runtime Tinyauth credentials." >&2
  exit 1
fi

unset AUTH_PASSWORD

# Start cron for periodic backups.
crond -l 2 -L /var/log/cron.log

COLLAB_DATA_DIR="${DATA_DIR%/}/collab"
mkdir -p "$COLLAB_DATA_DIR"
y-sweet serve --host 0.0.0.0 --port "${COLLAB_SERVER_PORT}" "$COLLAB_DATA_DIR" &

TINYAUTH_DATA_DIR="${DATA_DIR%/}/tinyauth"
mkdir -p "${TINYAUTH_DATA_DIR}"

tinyauth_secure_cookie_arg=""
if [ "${TINYAUTH_SECURE_COOKIE:-false}" = "true" ]; then
  tinyauth_secure_cookie_arg="--secure-cookie"
fi

# shellcheck disable=SC2086 # optional secure-cookie flag is intentionally word-split.
# 14 days = 14 * 24 * 60 * 60 = 1,209,600 seconds.
# FIXME: Tinyauth shows an "Invalid Domain" UI warning when the browser host differs
# from --app-url. We currently disable UI warnings globally to suppress this.
# A proper fix likely requires forking Tinyauth to support either athena.shared as
# app-url or per-warning suppression instead of an all-or-nothing toggle.
tinyauth \
  --app-title "RemDo" \
  --app-url "${TINYAUTH_APP_URL}" \
  --session-expiry "1209600" \
  --users "${TINYAUTH_USERS}" \
  --address 127.0.0.1 \
  --port "${TINYAUTH_PORT}" \
  --database-path "${TINYAUTH_DATA_DIR}/tinyauth.db" \
  --resources-dir "${TINYAUTH_DATA_DIR}/resources" \
  --disable-analytics \
  --disable-ui-warnings \
  ${tinyauth_secure_cookie_arg} &

exec caddy run --config /etc/caddy/Caddyfile --adapter caddyfile
