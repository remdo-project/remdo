#!/usr/bin/env sh
set -euo pipefail

# Default to the writable runtime root inside the container.
: "${REMDO_ROOT:=/app}"
export REMDO_ROOT

# shellcheck disable=SC1091 # provided by the image build.
. /usr/local/share/remdo/env.defaults.sh
# shellcheck disable=SC1091 # provided by the image build.
. /usr/local/share/remdo/entrypoint-env.sh

: "${XDG_DATA_HOME:=${DATA_DIR%/}}"
: "${XDG_CONFIG_HOME:=${DATA_DIR%/}/.config}"
export XDG_DATA_HOME XDG_CONFIG_HOME

# Bind loopback services on IPv4. Caddy proxies to 127.0.0.1 upstreams, but
# `localhost` (the env.defaults.sh default) can resolve to ::1 first, so the API
# server would listen IPv6-only and Caddy's IPv4 dial gets connection-refused.
# Pin HOST to the IPv4 loopback the Caddyfile uses. Override-able for callers
# (e.g. the docker E2E) that set it explicitly.
: "${HOST:=127.0.0.1}"
export HOST

remdo_configure_caddy_env

# Bootstrap secrets (production only). Resolves AUTH_SECRET and the Y-Sweet
# auth_key/server_token pair from env -> persisted DATA_DIR/secrets -> generate,
# so operators only set ADMIN_SECRET (+ APP_PUBLIC_URL). The tool emits
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

# Start cron for periodic backups. Backup needs the Y-Sweet server token, not
# app auth secrets or the Y-Sweet private auth key.
env -u AUTH_SECRET -u ADMIN_SECRET -u YSWEET_AUTH_KEY crond -l 2 -L /var/log/cron.log

env -u AUTH_SECRET -u ADMIN_SECRET -u YSWEET_SERVER_TOKEN Y_SWEET_AUTH="${YSWEET_AUTH_KEY}" \
  y-sweet serve --host 0.0.0.0 --port "${COLLAB_SERVER_PORT}" --prod "$COLLAB_DATA_DIR" &
env -u YSWEET_AUTH_KEY node /app/remdo-api-server.cjs &

exec env -u AUTH_SECRET -u ADMIN_SECRET -u YSWEET_AUTH_KEY -u YSWEET_SERVER_TOKEN \
  caddy run --config /etc/caddy/Caddyfile --adapter caddyfile
