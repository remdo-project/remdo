#!/usr/bin/env sh
set -eu
# shellcheck disable=SC3040 # allow POSIX sh + bash pipefail fallback usage
set -o pipefail 2>/dev/null || true

# crond runs this with a stripped environment (the image's `ENV DATA_DIR=/data`
# does NOT propagate into cron jobs), so the defaults here are load-bearing.
: "${REMDO_ROOT:=/app}"
: "${DATA_DIR:=/data}"
export REMDO_ROOT DATA_DIR

unset AUTH_SECRET ADMIN_SECRET YSWEET_AUTH_KEY

# shellcheck disable=SC1091 # provided by the image build.
. /usr/local/share/remdo/env.defaults.sh

node /app/backup.mjs --md
