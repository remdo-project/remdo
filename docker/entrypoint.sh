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

remdo_configure_caddy_env

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
