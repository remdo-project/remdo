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

remdo_docker_run() {
  local image_name="$1"
  local data_dir="$2"
  shift 2

  mkdir -p "${data_dir}"

  docker run "$@" \
    -v "${data_dir}:/srv/remdo/data" \
    -p "${PORT}:${PORT}" \
    "${image_name}"
}
