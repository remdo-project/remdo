#!/usr/bin/env sh
set -euo pipefail

: "${BASICAUTH_USER:?Set BASICAUTH_USER to the username for HTTP basic auth}"
: "${BASICAUTH_PASSWORD:?Set BASICAUTH_PASSWORD to the password for HTTP basic auth}"

# Compute a bcrypt hash at runtime so the plaintext password never touches the image.
BASICAUTH_PASSWORD_HASH="$(printf '%s\n' "$BASICAUTH_PASSWORD" | caddy hash-password --algorithm bcrypt)"
export BASICAUTH_PASSWORD_HASH
unset BASICAUTH_PASSWORD

y-sweet serve --host 0.0.0.0 --port "${YSWEET_PORT_INTERNAL}" /data &

exec caddy run --config /etc/caddy/Caddyfile --adapter caddyfile
