#!/usr/bin/env sh
# Shared Docker entrypoint environment derivation. Source from entrypoint/tests.

remdo_origin_field() {
  python -c '
import sys
from urllib.parse import urlsplit
try:
    origin = sys.argv[1]
    url = urlsplit(origin)
    if url.scheme not in ("http", "https") or not url.hostname or url.username or url.password or origin != f"{url.scheme}://{url.netloc}":
        raise ValueError
    print(url.scheme + ":" if sys.argv[2] == "protocol" else url.hostname)
except ValueError:
    sys.exit("APP_ORIGIN must be an exact HTTP(S) origin.")
' "$1" "$2"
}

remdo_configure_internal_services() {
  if [ "${REMDO_DEV_CONTAINER:-false}" != "true" ]; then
    API_SERVER_PORT=4011
    COLLAB_SERVER_PORT=4004
    MCP_SERVER_PORT=4013
  fi

  export API_SERVER_PORT COLLAB_SERVER_PORT MCP_SERVER_PORT
}

remdo_configure_caddy_env() {
  : "${APP_ORIGIN:?Set APP_ORIGIN to the canonical public RemDo origin}"
  app_origin_protocol="$(remdo_origin_field "${APP_ORIGIN}" protocol)" || return 1
  app_origin_hostname="$(remdo_origin_field "${APP_ORIGIN}" hostname)" || return 1

  if [ "${REMDO_DEV_CONTAINER:-false}" = "true" ]; then
    : "${REMDO_GATEWAY_BIND_ADDRESS:?Set REMDO_GATEWAY_BIND_ADDRESS for the development container}"
    CADDY_SITE_ADDRESS="${APP_ORIGIN}"
  else
    unset REMDO_GATEWAY_BIND_ADDRESS
    case "${app_origin_protocol}:${app_origin_hostname}" in
      http::*.localhost)
        if [ "${REMDO_LAUNCHER_LOOPBACK_HTTP:-false}" != "true" ]; then
          echo "HTTP *.localhost requires the self-hosted loopback launcher." >&2
          return 1
        fi
        CADDY_SITE_ADDRESS="${APP_ORIGIN}"
        ;;
      https::*)
        if [ -n "${PORT:-}" ]; then
          CADDY_SITE_ADDRESS="http://${app_origin_hostname}:${PORT}"
        else
          CADDY_SITE_ADDRESS="${APP_ORIGIN}"
        fi
        ;;
      *)
        echo "APP_ORIGIN must use HTTPS unless it is a loopback-only *.localhost deployment." >&2
        return 1
        ;;
    esac
  fi

  CADDY_FORWARDED_PROTO="${app_origin_protocol%:}"
  export APP_ORIGIN CADDY_SITE_ADDRESS CADDY_FORWARDED_PROTO
}

# Node sizes each heap from the container limit on its own, so the two Node
# services together could claim more memory than the instance has. Split what
# the Python API and the gateway leave (~256 MB measured under load) instead.
remdo_configure_node_heaps() {
  memory_limit="$1"
  collaboration_heap_mb=""
  mcp_heap_mb=""
  case "${memory_limit}" in
    ''|max) return 0 ;;
  esac
  node_heap_mb=$((memory_limit / 1048576 - 256))
  if [ "${node_heap_mb}" -lt 128 ]; then
    echo "RemDo needs a memory limit of at least 384 MB." >&2
    return 1
  fi
  mcp_heap_mb=$((node_heap_mb / 4))
  collaboration_heap_mb=$((node_heap_mb - mcp_heap_mb))
}
