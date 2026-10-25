#!/usr/bin/env sh
set -eu
cd "$(dirname "$0")/.."
./tools/django.sh migrate --noinput
./tools/django.sh setup_development_users
export PYTHONPATH="$PWD/backend"
exec uv run --locked uvicorn remdo.asgi:application --host 127.0.0.1 --port "${API_SERVER_PORT}" \
  --no-access-log --no-proxy-headers --timeout-graceful-shutdown 8 "$@"
