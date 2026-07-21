#!/usr/bin/env sh
# Run Codex's native review through the shared read-only runner.
set -eu

script_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
tsx_loader=$script_dir/../../../../node_modules/tsx/dist/loader.mjs

if [ ! -f "$tsx_loader" ]; then
  echo "run-codex-review: tsx is unavailable; run pnpm run dev:init" >&2
  exit 1
fi

exec node --import "$tsx_loader" "$script_dir/run-codex-review.ts" "$@"
