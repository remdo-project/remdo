#!/usr/bin/env sh
set -eu
cd "$(dirname "$0")/.."
exec ./tools/env.sh uv run --locked python backend/manage.py "$@"
