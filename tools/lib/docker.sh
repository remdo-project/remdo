#!/usr/bin/env bash
set -euo pipefail

remdo_load_dotenv() {
  local root_dir="$1"
  local env_file="${root_dir}/.env"

  if [[ -f "${env_file}" ]]; then
    set -a
    # shellcheck disable=SC1090
    . "${env_file}"
    set +a
  fi
}

remdo_load_env_defaults() {
  local root_dir="$1"

  export REMDO_ROOT="${REMDO_ROOT:-${root_dir}}"
  # shellcheck disable=SC1091 # shared defaults live in the repo.
  . "${root_dir}/tools/env.defaults.sh"
}

remdo_docker_build() {
  local root_dir="$1"
  local image_name="$2"

  docker build -f "${root_dir}/docker/Dockerfile" -t "${image_name}" "${root_dir}"
}

remdo_detect_docker_public_host() {
  local detected_host="${HOSTNAME:-}"

  if [[ -z "${detected_host}" ]] && command -v hostname >/dev/null 2>&1; then
    detected_host="$(hostname 2>/dev/null || true)"
  fi

  detected_host="$(printf '%s' "${detected_host}" | tr '[:upper:]' '[:lower:]')"
  detected_host="${detected_host%.}"

  case "${detected_host}" in
    ""|localhost|localhost.localdomain|localdomain)
      echo "Failed to detect a Docker public hostname. Set the VM hostname first." >&2
      return 1
      ;;
    *.*)
      printf '%s\n' "${detected_host}"
      return 0
      ;;
    *)
      printf '%s.shared\n' "${detected_host}"
      return 0
      ;;
  esac
}

remdo_configure_docker_runtime() {
  local public_host="${1:-}"
  local tinyauth_host=""

  if [[ -z "${public_host}" ]]; then
    public_host="$(remdo_detect_docker_public_host)"
  fi

  tinyauth_host="app.${public_host}"
  export CADDY_SITE_ADDRESS="https://${public_host}:${PORT}"
  export TINYAUTH_APP_URL="https://${tinyauth_host}:${PORT}"
}

remdo_docker_run() {
  local image_name="$1"
  local data_dir="$2"
  shift 2

  mkdir -p "${data_dir}"

  docker run "$@" \
    -v "${data_dir}:/app/data" \
    -p "${PORT}:${PORT}" \
    "${image_name}"
}
