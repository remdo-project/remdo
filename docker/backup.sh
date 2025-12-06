#!/usr/bin/env sh
set -eu
# shellcheck disable=SC3040
set -o pipefail 2>/dev/null || true

SNAPSHOT_BIN=${SNAPSHOT_BIN:-/usr/local/bin/snapshot.mjs}
TARGET_ROOT=${TARGET_ROOT:-/data}
TARGET_DIR="${TARGET_ROOT%/}/backup"

if [ ! -x "$SNAPSHOT_BIN" ]; then
  echo "snapshot binary not found at $SNAPSHOT_BIN" >&2
  exit 1
fi

mkdir -p "$TARGET_DIR"
"$SNAPSHOT_BIN" save "$TARGET_DIR/main" --md
"$SNAPSHOT_BIN" save "$TARGET_DIR/project" --doc project --md
