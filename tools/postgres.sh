#!/usr/bin/env bash
# Shell owns database processes; Django owns schema and fixture data.
set -euo pipefail
ROOT_DIR="$(cd -- "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
if [ -z "${PORT_BASE:-}" ]; then
  exec "${ROOT_DIR}/tools/env.sh" "$0" "$@"
fi
case "${1:-}" in
  run)
    shift
    : "${POSTGRES_PORT:=$((PORT_BASE + 12))}"
    export POSTGRES_PORT
    # A test command never receives a database selected by the operator's environment.
    postgres_project="remdo-test-pg-${POSTGRES_PORT}-$$"
    export PG_RUNTIME="${postgres_project}-postgres-1"
    export PG_NETWORK="${postgres_project}_default"
    compose=(docker compose -f "${ROOT_DIR}/compose.postgres.yaml" -p "${postgres_project}")
    cleanup() { "${compose[@]}" down -v >/dev/null 2>&1; }
    trap cleanup EXIT
    trap 'exit 130' INT
    trap 'exit 143' TERM
    "${compose[@]}" up -d --wait --wait-timeout 60 >/dev/null
    export DATABASE_URL="postgresql://remdo:development@127.0.0.1:${POSTGRES_PORT}/remdo"
    export DOCKER_DATABASE_URL="postgresql://remdo:development@postgres:5432/remdo"
    "$@"
    ;;
  *) echo 'Usage: postgres.sh run command...' >&2; exit 1 ;;
esac
