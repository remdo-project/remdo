#!/usr/bin/env bash
set -euo pipefail

remdo_load_dotenv() {
  local root_dir="$1"
  local env_file="${root_dir}/.env"

  # shellcheck disable=SC1091 # shared helper lives in the repo.
  . "${root_dir}/tools/lib/env-file.sh"
  remdo_load_dotenv_file "${env_file}"
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

remdo_docker_daemon_is_rootless() {
  docker info --format '{{json .SecurityOptions}}' | grep -Fq -e '"rootless"' -e '"name=rootless"'
}

remdo_require_rootless_docker() {
  if remdo_docker_daemon_is_rootless; then
    return 0
  fi

  echo "Local Docker requires a rootless Docker daemon." >&2
  echo "This launcher no longer supports rootful Docker because it cannot keep repo data user-owned without extra runtime complexity." >&2
  return 1
}

remdo_require_rootless_host_network() {
  remdo_require_rootless_docker || return 1

  local server_version
  server_version="$(docker version --format '{{.Server.Version}}')"
  if [[ "$(printf '%s\n' '29.5.0' "${server_version}" | sort -V | head -n 1)" != "29.5.0" ]]; then
    echo "Rootless host networking requires Docker Engine 29.5 or newer (found ${server_version})." >&2
    return 1
  fi
}

remdo_docker_run() {
  local image_name="$1"
  local data_dir="$2"
  shift 2
  mkdir -p "${data_dir}"

  docker run "$@" \
    -v "${data_dir}:/data" \
    "${image_name}"
}
