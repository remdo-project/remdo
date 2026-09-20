#!/usr/bin/env sh
set -eu
cd "$(dirname "$0")/.."
if [ "${1:-}" = test ]; then
  export DJANGO_SETTINGS_MODULE=remdo.testing
  # Only the verification wrapper may supply an external test database.
  if [ -z "${PG_RUNTIME:-}" ]; then
    export DATABASE_URL=
  fi
fi
exec ./tools/env.sh uv run --locked python backend/manage.py "$@"
