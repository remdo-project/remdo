#!/usr/bin/env sh
set -eu

# shellcheck disable=SC1091 # shared helper lives in the repo.
. "$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)/lib/drop-npm-run-delimiter.sh"

exec pnpm exec vitest "$@"
