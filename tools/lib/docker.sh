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

  echo "Local Docker mode requires a rootless Docker daemon." >&2
  echo "This launcher no longer supports rootful Docker because it cannot keep repo data user-owned without extra runtime complexity." >&2
  return 1
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

  if [[ -z "${public_host}" ]]; then
    public_host="$(remdo_detect_docker_public_host)"
  fi

  export APP_PUBLIC_URL="https://${public_host}:${PORT}"
}

remdo_docker_run() {
  local image_name="$1"
  local data_dir="$2"
  shift 2
  local docker_args=("$@")

  mkdir -p "${data_dir}"

  # Host networking shares the host's network namespace (so the container reaches
  # host services like a linked source at the same origin the browser uses) and
  # is incompatible with `-p`; only publish the port when not on host networking.
  local uses_host_network="false"
  for arg in "${docker_args[@]}"; do
    if [[ "${arg}" == "--network=host" || "${arg}" == "--net=host" ]]; then
      uses_host_network="true"
      break
    fi
  done
  if [[ "${uses_host_network}" != "true" ]]; then
    docker_args+=(-p "${PORT}:${PORT}")
  fi

  docker run "${docker_args[@]}" \
    -v "${data_dir}:/app/data" \
    "${image_name}"
}
