#!/usr/bin/env sh
set -eu
# shellcheck disable=SC3040
set -o pipefail 2>/dev/null || true
PATH="/usr/local/bin:/usr/bin:/bin:${PATH:-}"

NODE_BIN=${NODE_BIN:-/usr/local/bin/node}
SNAPSHOT_BIN=${SNAPSHOT_BIN:-/usr/local/bin/snapshot.mjs}
PORT=${APP_PORT:-${PORT:-8080}}
HOST=${HOST:-127.0.0.1}
COLLAB_SERVER_PORT=${COLLAB_SERVER_PORT:-${YSWEET_PORT_INTERNAL:-8081}}
COLLAB_CLIENT_PORT=${COLLAB_CLIENT_PORT:-$PORT}
NODE_ENV=${NODE_ENV:-production}

if [ ! -x "$SNAPSHOT_BIN" ]; then
  echo "snapshot binary not found at $SNAPSHOT_BIN" >&2
  exit 1
fi

mkdir -p /data/backup

HOST="$HOST" PORT="$PORT" COLLAB_SERVER_PORT="$COLLAB_SERVER_PORT" COLLAB_CLIENT_PORT="$COLLAB_CLIENT_PORT" NODE_ENV="$NODE_ENV" \
  "$NODE_BIN" "$SNAPSHOT_BIN" backup /data/backup --md
HOST="$HOST" PORT="$PORT" COLLAB_SERVER_PORT="$COLLAB_SERVER_PORT" COLLAB_CLIENT_PORT="$COLLAB_CLIENT_PORT" NODE_ENV="$NODE_ENV" \
  "$NODE_BIN" "$SNAPSHOT_BIN" backup /data/backup --doc project --md
