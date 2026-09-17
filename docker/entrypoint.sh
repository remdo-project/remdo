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
mkdir -p "${TMPDIR:-/tmp}" "${DATA_DIR%/}/collab" "${DATA_DIR%/}/public-share"

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

  for managed_child in $managed_children; do
    child_name="${managed_child%%:*}"
    child_pid="${managed_child#*:}"
    signal="$child_signal"
    # Y-Sweet flushes persistent state through its SIGINT shutdown path.
    if [ "$child_name" = "y-sweet" ]; then
      signal="INT"
    fi
    kill "-${signal}" "$child_pid" 2>/dev/null || true
  done

  shutdown_attempts=100
  while [ "$shutdown_attempts" -gt 0 ]; do
    children_running=false
    for managed_child in $managed_children; do
      child_pid="${managed_child#*:}"
      if kill -0 "$child_pid" 2>/dev/null; then
        children_running=true
        break
      fi
    done
    if [ "$children_running" = "false" ]; then
      break
    fi
    sleep 0.1
    shutdown_attempts="$((shutdown_attempts - 1))"
  done

  for managed_child in $managed_children; do
    child_pid="${managed_child#*:}"
    if kill -0 "$child_pid" 2>/dev/null; then
      kill -KILL "$child_pid" 2>/dev/null || true
    fi
  done
  for managed_child in $managed_children; do
    child_pid="${managed_child#*:}"
    wait "$child_pid" 2>/dev/null || true
  done
}

trap 'stop_children INT; exit 130' INT
trap 'stop_children TERM; exit 143' TERM

start_child y-sweet python -m remdo.collaboration_server
start_child api gunicorn remdo.wsgi --bind "127.0.0.1:${API_SERVER_PORT}" --threads 4 --graceful-timeout 8
start_child caddy env -u AUTH_SECRET -u ADMIN_SECRET -u YSWEET_AUTH_KEY -u YSWEET_SERVER_TOKEN \
  -u AWS_ACCESS_KEY_ID -u AWS_SECRET_ACCESS_KEY -u AWS_SESSION_TOKEN \
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
