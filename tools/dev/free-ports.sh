#!/usr/bin/env sh
set -eu

command -v lsof >/dev/null || { echo "free-ports: lsof is required." >&2; exit 1; }

pids=""
for service_port in "${PORT}" "${COLLAB_SERVER_PORT}" "${API_SERVER_PORT}" "${MCP_SERVER_PORT}"; do
  for pid in $(lsof -t -iTCP:"${service_port}" -sTCP:LISTEN || true); do
    case " ${pids} " in *" ${pid} "*) continue ;; esac
    echo "free-ports: port ${service_port}: $(ps -o pid=,args= -p "${pid}" | cut -c1-140)"
    pids="${pids} ${pid}"
  done
done

[ -n "${pids}" ] || exit 0

# shellcheck disable=SC2086 # pids is a space-separated list.
kill ${pids} 2>/dev/null || true
for _ in 1 2 3 4 5 6; do
  alive=""
  for pid in ${pids}; do
    if kill -0 "${pid}" 2>/dev/null; then alive="${alive} ${pid}"; fi
  done
  [ -n "${alive}" ] || exit 0
  sleep 0.5
done
# shellcheck disable=SC2086
kill -9 ${alive} 2>/dev/null || true
