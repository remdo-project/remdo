#!/usr/bin/env sh
set -euo pipefail

: "${BASICAUTH_USER:?Set BASICAUTH_USER to the username for HTTP basic auth}"
: "${BASICAUTH_PASSWORD_HASH:?Set BASICAUTH_PASSWORD_HASH to the bcrypt hash for HTTP basic auth}"

y-sweet serve --host 0.0.0.0 --port "${YSWEET_PORT_INTERNAL}" /data &

exec caddy run --config /etc/caddy/Caddyfile --adapter caddyfile
