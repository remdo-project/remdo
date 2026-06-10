#!/usr/bin/env sh
# Shared Docker entrypoint environment derivation. Source from entrypoint/tests.

remdo_url_field() {
  node -e "const url = new URL(process.argv[1]); console.log(url[process.argv[2]]);" "$1" "$2"
}

remdo_public_url_port() {
  node -e '
    const url = new URL(process.argv[1]);
    console.log(url.port || (url.protocol === "https:" ? "443" : url.protocol === "http:" ? "80" : ""));
  ' "$1"
}

remdo_configure_caddy_env() {
  : "${APP_PUBLIC_URL:?Set APP_PUBLIC_URL to the canonical public RemDo URL}"

  app_public_protocol="$(remdo_url_field "${APP_PUBLIC_URL}" protocol)"
  app_public_port="$(remdo_public_url_port "${APP_PUBLIC_URL}")"
  canonical_url="${APP_PUBLIC_URL}"

  if [ -z "${CADDY_SITE_ADDRESSES:-}" ]; then
    if [ "${app_public_protocol}" = "https:" ] && [ -n "${PORT:-}" ] && [ "${PORT}" != "${app_public_port}" ]; then
      CADDY_SITE_ADDRESSES=":${PORT}"
    else
      CADDY_SITE_ADDRESSES="${APP_PUBLIC_URL}"
    fi
  fi

  if [ -z "${CADDY_TLS_DIRECTIVE+x}" ]; then
    if [ "${app_public_protocol}" = "https:" ] && [ "${CADDY_SITE_ADDRESSES}" = "${APP_PUBLIC_URL}" ]; then
      CADDY_TLS_DIRECTIVE="tls internal"
    else
      CADDY_TLS_DIRECTIVE=""
    fi
  fi

  CADDY_CANONICAL_HOST="$(remdo_url_field "${canonical_url}" hostname)"

  export APP_PUBLIC_URL
  export CADDY_SITE_ADDRESSES
  export CADDY_TLS_DIRECTIVE
  export CADDY_CANONICAL_HOST
}
