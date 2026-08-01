#!/usr/bin/env sh
# Run local-stack E2E in the working directory's reserved +50 port range.
set -eu

ROOT_DIR="$(CDPATH= cd -- "$(dirname "$0")/../.." && pwd)"

if [ "${1:-}" = "--" ]; then
  shift
fi

# A short TMPDIR keeps tsx IPC socket paths valid in long worktrees.
exec env -u NO_COLOR \
  DATA_DIR="${ROOT_DIR}/data/e2e-runtime" \
  TMPDIR=/tmp \
  "${ROOT_DIR}/tools/env.sh" --port-base-offset 50 \
  sh -c '
    set -eu
    rm -rf -- "${DATA_DIR}"
    mkdir -p -- "${DATA_DIR}"
    exec pnpm exec playwright test "$@"
  ' sh "$@"
