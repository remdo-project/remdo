#!/usr/bin/env sh
set -euo pipefail

: "${BASICAUTH_USER:?Set BASICAUTH_USER to the username for HTTP basic auth}"
: "${BASICAUTH_PASSWORD:?Set BASICAUTH_PASSWORD to the password for HTTP basic auth}"

# Compute a bcrypt hash at runtime so the plaintext password never touches the image.
BASICAUTH_PASSWORD_HASH="$(printf '%s\n' "$BASICAUTH_PASSWORD" | caddy hash-password --algorithm bcrypt)"
export BASICAUTH_PASSWORD_HASH
unset BASICAUTH_PASSWORD

: "${DATA_DIR:?Set DATA_DIR for persistent storage}"
: "${COLLAB_SERVER_PORT:?Set COLLAB_SERVER_PORT for the collab server}"

# Start cron for periodic backups.
crond -l 2 -L /var/log/cron.log

COLLAB_DATA_DIR="${DATA_DIR%/}/collab"
mkdir -p "$COLLAB_DATA_DIR"
y-sweet serve --host 0.0.0.0 --port "${COLLAB_SERVER_PORT}" "$COLLAB_DATA_DIR" &

exec caddy run --config /etc/caddy/Caddyfile --adapter caddyfile
