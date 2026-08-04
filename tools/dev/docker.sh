#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd -- "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
NETWORK="bridge"

if [[ "${1:-}" == "--" ]]; then
  shift
fi
if [[ "${1:-}" == "--network=host" ]]; then
  NETWORK="host"
  shift
fi
if [[ "$#" -ne 0 ]]; then
  echo "Usage: pnpm run dev:docker [-- --network=host]" >&2
  exit 1
fi

exec "${ROOT_DIR}/tools/env.sh" --port-base-offset 40 \
  env REMDO_DEV_DOCKER_NETWORK="${NETWORK}" \
  "${ROOT_DIR}/tools/dev/docker-run.sh"
