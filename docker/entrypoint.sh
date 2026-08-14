#!/usr/bin/env sh
# shellcheck disable=SC3040 # BusyBox ash supports pipefail in the production image.
set -euo pipefail

# Default to the writable runtime root inside the container. DATA_DIR needs no
# handling here: the image's `ENV DATA_DIR=/data` already exports it into this
# process (and thus into the sourced env.defaults.sh and every child).
: "${REMDO_ROOT:=/app}"
export REMDO_ROOT

# shellcheck disable=SC1091 # provided by the image build.
. /usr/local/share/remdo/env.defaults.sh
# shellcheck disable=SC1091 # provided by the image build.
. /usr/local/share/remdo/entrypoint-env.sh

: "${XDG_DATA_HOME:=${DATA_DIR%/}}"
: "${XDG_CONFIG_HOME:=${DATA_DIR%/}/.config}"
export XDG_DATA_HOME XDG_CONFIG_HOME

remdo_configure_internal_services
remdo_configure_caddy_env

# Bootstrap secrets (production only). Resolves AUTH_SECRET and the Y-Sweet
# auth_key/server_token pair from env -> persisted DATA_DIR/secrets -> generate,
# so operators only set ADMIN_SECRET (+ APP_ORIGIN). The tool emits
# `export VAR='...'` lines on stdout only; we eval them so secrets never reach a
# log. ADMIN_SECRET is never generated and is still asserted below.
if [ "${NODE_ENV}" = "production" ]; then
  # Capture into a variable first so a non-zero exit (e.g. the persistence
  # guard) aborts the entrypoint; `eval "$(...)"` would swallow the status.
  bootstrap_exports="$(node /app/bootstrap-secrets.cjs)"
  eval "${bootstrap_exports}"
  unset bootstrap_exports
  export AUTH_SECRET YSWEET_AUTH_KEY YSWEET_SERVER_TOKEN
fi

remdo_require_api_secrets

COLLAB_DATA_DIR="${DATA_DIR%/}/collab"
mkdir -p "$COLLAB_DATA_DIR"
: "${YSWEET_AUTH_KEY:?Set YSWEET_AUTH_KEY}"
: "${YSWEET_SERVER_TOKEN:?Set YSWEET_SERVER_TOKEN}"

child_pids=""

start_child() {
  (
    trap - INT TERM
    exec "$@"
  ) &
  child_pid="$!"
  child_pids="${child_pids} ${child_pid}"
}

stop_children() {
  child_signal="$1"
  trap - INT TERM

  for child_pid in $child_pids; do
    kill "-${child_signal}" "$child_pid" 2>/dev/null || true
  done
  for child_pid in $child_pids; do
    wait "$child_pid" 2>/dev/null || true
  done
}

trap 'stop_children INT; exit 130' INT
trap 'stop_children TERM; exit 143' TERM

# Start production cron for periodic backups. Backup needs the Y-Sweet server
# token, not app auth secrets or the Y-Sweet private auth key.
if [ "${REMDO_DEV_CONTAINER:-false}" != "true" ]; then
  start_child env -u AUTH_SECRET -u ADMIN_SECRET -u YSWEET_AUTH_KEY \
    crond -f -l 2 -L /var/log/cron.log
fi

start_child env -u AUTH_SECRET -u ADMIN_SECRET -u YSWEET_SERVER_TOKEN \
  RUST_LOG=error Y_SWEET_AUTH="${YSWEET_AUTH_KEY}" y-sweet serve --host 127.0.0.1 \
  --port "${COLLAB_SERVER_PORT}" --prod "$COLLAB_DATA_DIR"
start_child env -u YSWEET_AUTH_KEY node /app/remdo-api-server.cjs

start_child env -u AUTH_SECRET -u ADMIN_SECRET -u YSWEET_AUTH_KEY -u YSWEET_SERVER_TOKEN \
  caddy run --config /etc/caddy/Caddyfile --adapter caddyfile
caddy_pid="$child_pid"

if wait "$caddy_pid"; then
  caddy_status=0
else
  caddy_status="$?"
fi
stop_children TERM
exit "$caddy_status"
