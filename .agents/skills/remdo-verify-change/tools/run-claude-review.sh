#!/usr/bin/env sh
# Run Claude's native review through the shared read-only runner.
set -eu

script_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
exec node "$script_dir/run-claude-review.ts" "$@"
