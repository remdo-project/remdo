#!/usr/bin/env sh
set -eu
# shellcheck disable=SC3040 # allow POSIX sh + bash pipefail fallback usage
set -o pipefail 2>/dev/null || true

# crond runs this with a stripped environment, so the image's DATA_DIR does not
# reach scheduled jobs.
: "${REMDO_ROOT:=/app}"
: "${DATA_DIR:=/data}"
export REMDO_ROOT DATA_DIR

unset AUTH_SECRET ADMIN_SECRET YSWEET_AUTH_KEY

# shellcheck disable=SC1091 # provided by the image build.
. /usr/local/share/remdo/env.defaults.sh
# shellcheck disable=SC1091 # provided by the image build.
. /usr/local/share/remdo/entrypoint-env.sh
remdo_configure_internal_services

node /app/backup.mjs --md
