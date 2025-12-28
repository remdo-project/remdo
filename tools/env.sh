#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(git rev-parse --show-toplevel)"
ENV_FILE="${ROOT_DIR}/.env"

if [[ -f "${ENV_FILE}" ]]; then
  # shellcheck disable=SC1090 # allow sourcing repo-local .env
  . "${ENV_FILE}"
fi

export REMDO_ROOT="${REMDO_ROOT:-${ROOT_DIR}}"
# shellcheck disable=SC1091 # shared defaults live in the repo.
. "${ROOT_DIR}/tools/env.defaults.sh"

if [[ "$#" -eq 0 ]]; then
  echo "Usage: env.sh <command>" >&2
  exit 1
fi

exec "$@"
