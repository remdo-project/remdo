#!/usr/bin/env sh
# shellcheck disable=SC3040 # BusyBox ash supports pipefail in the production image.
set -euo pipefail

# Default to the writable runtime root inside the container. DATA_DIR needs no
# handling here: the image's `ENV DATA_DIR=/data` already exports it into this
# process (and thus into the sourced env.defaults.sh and every child).
: "${REMDO_ROOT:=/app}"
export REMDO_ROOT

# shellcheck disable=SC1091 # provided by the image build.
. /usr/local/share/remdo/env.defaults.sh
if [ "${REMDO_DEV_CONTAINER:-false}" = "true" ]; then
  # Docker development receives its resolved addresses and fixture credentials.
  export DJANGO_SETTINGS_MODULE=remdo.development
else
  remdo_configure_environment production
fi
# shellcheck disable=SC1091 # provided by the image build.
. /usr/local/share/remdo/entrypoint-env.sh

: "${XDG_DATA_HOME:=${DATA_DIR%/}}"
: "${XDG_CONFIG_HOME:=${DATA_DIR%/}/.config}"
export XDG_DATA_HOME XDG_CONFIG_HOME

remdo_configure_internal_services
remdo_configure_caddy_env

python manage.py migrate --noinput
python manage.py collectstatic --noinput
if [ "${REMDO_DEV_CONTAINER:-false}" = "true" ]; then
  python manage.py setup_development_users
fi
mkdir -p "${TMPDIR:-/tmp}"
# env.defaults.sh exports both names unconditionally, so assigning one alone
# would leave the next settings load with an incomplete bundle, which it
# rejects. Read the pair from one interpreter and assign only once both exist.
resolved_secrets="$(python -c 'from django.conf import settings; print(settings.SECRET_KEY); print(settings.COLLAB_INTERNAL_SECRET)')"
AUTH_SECRET="$(printf '%s\n' "${resolved_secrets}" | head -n 1)"
COLLAB_INTERNAL_SECRET="$(printf '%s\n' "${resolved_secrets}" | tail -n 1)"
unset resolved_secrets
export AUTH_SECRET COLLAB_INTERNAL_SECRET

managed_children=""

start_child() {
  child_name="$1"
  shift
  (
    trap - INT TERM
    exec "$@"
  ) &
  child_pid="$!"
  managed_children="${managed_children} ${child_name}:${child_pid}"
}

stop_children() {
  child_signal="$1"
  trap - INT TERM

  # Keep Django alive until collaboration has finished its SQL persistence.
  for stopping_name in caddy collaboration api; do
    for managed_child in $managed_children; do
      child_name="${managed_child%%:*}"
      child_pid="${managed_child#*:}"
      [ "$child_name" = "$stopping_name" ] || continue
      kill "-${child_signal}" "$child_pid" 2>/dev/null || true
      shutdown_attempts=100
      # Collaboration allows an in-flight request, a final save, and cleanup.
      [ "$child_name" != collaboration ] || shutdown_attempts=300
      while kill -0 "$child_pid" 2>/dev/null && [ "$shutdown_attempts" -gt 0 ]; do
        sleep 0.1
        shutdown_attempts="$((shutdown_attempts - 1))"
      done
      if kill -0 "$child_pid" 2>/dev/null; then
        echo "Production service ${child_name} exceeded its shutdown deadline." >&2
        kill -KILL "$child_pid" 2>/dev/null || true
      fi
      wait "$child_pid" 2>/dev/null || true
    done
  done
}

trap 'stop_children INT; exit 130' INT
trap 'stop_children TERM; exit 143' TERM

start_child api gunicorn remdo.wsgi --bind "127.0.0.1:${API_SERVER_PORT}" --threads 4 --graceful-timeout 8
python - <<'PYREADY' || { stop_children TERM; exit 1; }
import os
import time
from urllib.request import Request, urlopen
from urllib.parse import urlsplit
for attempt in range(100):
    try:
        with urlopen(Request(f"http://127.0.0.1:{os.environ['API_SERVER_PORT']}/api/health", headers={"Host": urlsplit(os.environ["APP_ORIGIN"]).netloc}), timeout=1):
            break
    except OSError:
        time.sleep(0.1)
else:
    raise SystemExit("Django did not become ready.")
PYREADY
start_child collaboration env -u AUTH_SECRET -u DATABASE_URL node /app/collaboration.mjs
start_child caddy env -u AUTH_SECRET -u COLLAB_INTERNAL_SECRET \
  caddy run --config /etc/caddy/Caddyfile --adapter caddyfile

while :; do
  for managed_child in $managed_children; do
    child_name="${managed_child%%:*}"
    child_pid="${managed_child#*:}"
    if ! kill -0 "$child_pid" 2>/dev/null; then
      if wait "$child_pid"; then
        child_status=0
      else
        child_status="$?"
      fi
      echo "Production service ${child_name} exited unexpectedly with status ${child_status}." >&2
      stop_children TERM
      if [ "$child_status" -eq 0 ]; then
        child_status=1
      fi
      exit "$child_status"
    fi
  done
  sleep 1
done
