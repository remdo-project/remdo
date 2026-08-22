#!/usr/bin/env sh
# Shared Docker entrypoint environment derivation. Source from entrypoint/tests.

remdo_origin_field() {
  node -e '
    try {
      const url = new URL(process.argv[1]);
      if (!["http:", "https:"].includes(url.protocol) || url.origin !== process.argv[1]) throw new Error();
      console.log(url[process.argv[2]]);
    } catch {
      console.error("APP_ORIGIN must be an exact HTTP(S) origin.");
      process.exit(1);
    }
  ' "$1" "$2"
}

remdo_configure_internal_services() {
  if [ "${REMDO_DEV_CONTAINER:-false}" != "true" ]; then
    API_SERVER_PORT=4011
    COLLAB_SERVER_PORT=4004
  fi
  YSWEET_CONNECTION_STRING="ys://127.0.0.1:${COLLAB_SERVER_PORT}"

  export API_SERVER_PORT COLLAB_SERVER_PORT YSWEET_CONNECTION_STRING
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

  export APP_ORIGIN CADDY_SITE_ADDRESS
}

remdo_require_api_secrets() {
  : "${AUTH_SECRET:?Set AUTH_SECRET}"
  : "${ADMIN_SECRET:?Set ADMIN_SECRET}"
  if [ "${REMDO_DEV_CONTAINER:-false}" = "true" ]; then
    return
  fi
  [ "${#AUTH_SECRET}" -ge 32 ] || { echo "AUTH_SECRET must be at least 32 characters." >&2; return 1; }
  [ "${#ADMIN_SECRET}" -ge 32 ] || { echo "ADMIN_SECRET must be at least 32 characters." >&2; return 1; }
}
