#!/usr/bin/env sh
set -eu
# shellcheck disable=SC3040 # allow POSIX sh + bash pipefail fallback usage
set -o pipefail 2>/dev/null || true

# Required runtime config (from .env).
: "${PORT:?Set PORT in the env file}"
: "${COLLAB_SERVER_PORT:?Set COLLAB_SERVER_PORT in the env file}"
: "${DATA_DIR:?Set DATA_DIR in the env file}"

# Local derived paths (script-specific).
BACKUP_DIR="${DATA_DIR%/}/backup"

mkdir -p "$BACKUP_DIR"

PORT="$PORT" COLLAB_SERVER_PORT="$COLLAB_SERVER_PORT" DATA_DIR="$DATA_DIR" \
  snapshot.mjs backup "$BACKUP_DIR" --md
PORT="$PORT" COLLAB_SERVER_PORT="$COLLAB_SERVER_PORT" DATA_DIR="$DATA_DIR" \
  snapshot.mjs backup "$BACKUP_DIR" --doc project --md
