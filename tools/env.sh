#!/usr/bin/env sh
# POSIX sh only: Docker build runs in Alpine without bash.
set -eu

ROOT_DIR="$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)"
ENV_FILE="${ROOT_DIR}/.env"

if [ -f "${ENV_FILE}" ]; then
  while IFS= read -r assignment || [ -n "${assignment}" ]; do
    case "${assignment}" in
      '' | '#'*) continue ;;
      export\ *) assignment="${assignment#export }" ;;
    esac

    key="${assignment%%=*}"
    case "${key}" in
      '' | [0-9]* | *[!A-Za-z0-9_]*) continue ;;
    esac

    eval '[ "${'"${key}"'+x}" = x ]' && continue
    eval "export ${assignment}"
  done < "${ENV_FILE}"
fi

export REMDO_ROOT="${REMDO_ROOT:-${ROOT_DIR}}"
# shellcheck disable=SC1091 # shared defaults live in the repo.
. "${ROOT_DIR}/tools/env.defaults.sh"

mkdir -p "${TMPDIR}"

if [ "$#" -eq 0 ]; then
  echo "Usage: env.sh <command>" >&2
  exit 1
fi

exec "$@"
