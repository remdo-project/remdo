#!/usr/bin/env sh
# POSIX sh only: Docker build runs in Alpine without bash.
set -eu

ROOT_DIR="$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)"
ENV_FILE="${ROOT_DIR}/.env"

# shellcheck disable=SC1091 # shared helper lives in the repo.
. "${ROOT_DIR}/tools/lib/env-file.sh"
remdo_load_dotenv_file "${ENV_FILE}"

export REMDO_ROOT="${REMDO_ROOT:-${ROOT_DIR}}"
# shellcheck disable=SC1091 # shared defaults live in the repo.
. "${ROOT_DIR}/tools/env.defaults.sh"

mkdir -p "${TMPDIR}"

if [ "$#" -eq 0 ]; then
  echo "Usage: env.sh <command>" >&2
  exit 1
fi

exec "$@"
