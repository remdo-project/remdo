#!/usr/bin/env sh
set -eu
cd "$(dirname "$0")/.."
if [ "${1:-}" = test ]; then
  export DJANGO_SETTINGS_MODULE=remdo.verification
fi
exec ./tools/env.sh uv run --locked python backend/manage.py "$@"
