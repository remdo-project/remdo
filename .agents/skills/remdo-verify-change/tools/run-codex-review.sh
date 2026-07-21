#!/usr/bin/env sh
# Run Codex's native review through the shared read-only runner.
set -eu

script_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
exec node "$script_dir/run-codex-review.ts" "$@"
