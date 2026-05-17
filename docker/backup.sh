#!/usr/bin/env sh
set -eu
# shellcheck disable=SC3040 # allow POSIX sh + bash pipefail fallback usage
set -o pipefail 2>/dev/null || true

: "${REMDO_ROOT:=/app}"
export REMDO_ROOT

unset AUTH_SECRET ADMIN_SECRET YSWEET_AUTH_KEY

# shellcheck disable=SC1091 # provided by the image build.
. /usr/local/share/remdo/env.defaults.sh

# Local derived paths (script-specific).
BACKUP_DIR="${DATA_DIR%/}/backup"

mkdir -p "$BACKUP_DIR"

node /app/snapshot.mjs backup "$BACKUP_DIR" --md
node /app/snapshot.mjs backup "$BACKUP_DIR" --doc project --md
