#!/usr/bin/env sh
set -euo pipefail

# Default to the writable runtime root inside the container.
: "${REMDO_ROOT:=/app}"
export REMDO_ROOT

# shellcheck disable=SC1091 # provided by the image build.
. /usr/local/share/remdo/env.defaults.sh

: "${XDG_DATA_HOME:=${DATA_DIR%/}}"
: "${XDG_CONFIG_HOME:=${DATA_DIR%/}/.config}"
export XDG_DATA_HOME XDG_CONFIG_HOME

: "${APP_PUBLIC_URL:=:${PORT}}"
: "${CADDY_SITE_ADDRESSES:=${APP_PUBLIC_URL}}"

case "${APP_PUBLIC_URL}" in
  https://*)
    CADDY_TLS_DIRECTIVE="tls internal"
    canonical_url="${APP_PUBLIC_URL}"
    ;;
  *)
    CADDY_TLS_DIRECTIVE=""
    canonical_url="${APP_PUBLIC_URL}"
    ;;
esac

canonical_url_no_scheme="${canonical_url#*://}"
CADDY_CANONICAL_HOSTPORT="${canonical_url_no_scheme%%/*}"
CADDY_CANONICAL_HOST="${CADDY_CANONICAL_HOSTPORT%%:*}"

export APP_PUBLIC_URL
export CADDY_SITE_ADDRESSES
export CADDY_TLS_DIRECTIVE
export CADDY_CANONICAL_HOST
export CADDY_CANONICAL_HOSTPORT

# Start cron for periodic backups.
crond -l 2 -L /var/log/cron.log

COLLAB_DATA_DIR="${DATA_DIR%/}/collab"
mkdir -p "$COLLAB_DATA_DIR"
y-sweet serve --host 0.0.0.0 --port "${COLLAB_SERVER_PORT}" "$COLLAB_DATA_DIR" &
node /app/remdo-api-server.cjs &

exec caddy run --config /etc/caddy/Caddyfile --adapter caddyfile
