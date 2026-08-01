#!/usr/bin/env sh
# POSIX sh only: Docker build runs in Alpine without bash.
set -eu

ROOT_DIR="$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)"
ENV_FILE="${ROOT_DIR}/.env"
_remdo_port_base_offset=""

while [ "$#" -gt 0 ]; do
  case "$1" in
    --port-base-offset)
      if [ "$#" -lt 2 ]; then
        echo "env.sh: --port-base-offset requires a non-negative integer" >&2
        exit 1
      fi
      case "$2" in
        '' | *[!0-9]*)
          echo "env.sh: --port-base-offset requires a non-negative integer" >&2
          exit 1
          ;;
      esac
      _remdo_port_base_offset="$2"
      shift 2
      ;;
    --)
      shift
      break
      ;;
    *)
      break
      ;;
  esac
done

# shellcheck disable=SC1091 # shared helper lives in the repo.
. "${ROOT_DIR}/tools/lib/env-file.sh"
remdo_load_dotenv_file "${ENV_FILE}"

export REMDO_ROOT="${REMDO_ROOT:-${ROOT_DIR}}"
# shellcheck disable=SC1091 # shared defaults live in the repo.
. "${ROOT_DIR}/tools/env.defaults.sh"

mkdir -p "${TMPDIR}"

if [ "$#" -eq 0 ]; then
  echo "Usage: env.sh [--port-base-offset <offset>] <command>" >&2
  exit 1
fi

exec "$@"
