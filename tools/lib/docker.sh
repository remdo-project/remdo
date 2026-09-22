#!/usr/bin/env bash
set -euo pipefail

remdo_load_dotenv() {
  local root_dir="$1"
  local env_file="${root_dir}/.env"

  # shellcheck disable=SC1091 # shared helper lives in the repo.
  . "${root_dir}/tools/lib/env-file.sh"
  remdo_load_dotenv_file "${env_file}"
}

remdo_seed_admin_password() {
  local root_dir="$1"
  local env_file="${root_dir}/.env"
  local generated

  # An assignment of any form, including an empty one, is the operator's answer:
  # empty declines the bootstrap account that docker/entrypoint.sh would create.
  if [[ -n "${REMDO_ADMIN_PASSWORD+x}" ]]; then
    return 0
  fi

  # Reading a fixed block keeps tr from being killed by SIGPIPE, which would
  # otherwise fail the launcher under pipefail.
  generated="$(LC_ALL=C tr -dc 'A-Za-z0-9' < <(head -c 512 /dev/urandom) | cut -c1-32)"
  printf 'REMDO_ADMIN_PASSWORD=%s\n' "${generated}" >> "${env_file}"
  export REMDO_ADMIN_PASSWORD="${generated}"
  echo "Generated REMDO_ADMIN_PASSWORD in ${env_file} for admin@example.test." >&2
}

remdo_load_env_defaults() {
  local root_dir="$1"

  export REMDO_ROOT="${REMDO_ROOT:-${root_dir}}"
  # shellcheck disable=SC1091 # shared defaults live in the repo.
  . "${root_dir}/tools/env.defaults.sh"
  remdo_configure_environment "$2"
}

remdo_docker_build() {
  local root_dir="$1"
  local image_name="$2"
  local build_revision
  build_revision="${BUILD_REVISION:-$(git -C "${root_dir}" rev-parse HEAD 2>/dev/null || true)}"

  docker build --build-arg "BUILD_REVISION=${build_revision}" \
    -f "${root_dir}/docker/Dockerfile" -t "${image_name}" "${root_dir}"
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

  # Allow the ordered gateway (10s), collaboration (30s), and API (10s) drain.
  docker run --stop-timeout 55 "$@" \
    -v "${data_dir}:/data" \
    "${image_name}"
}
