#!/usr/bin/env sh
# POSIX sh only: Docker build runs in Alpine without bash.
# `pnpm run <script> -- <filter>` forwards a literal `--` (npm strips it, pnpm
# does not). Vitest's parser routes every argument after `--` away from the
# filter list, so the whole suite runs instead of the requested files. Drop the
# separator, matching tools/e2e/run.sh.
set -eu

# Only the verification wrapper may supply an external test database.
if [ -z "${PG_RUNTIME:-}" ]; then
  export DATABASE_URL=
fi

for argument in "$@"; do
  shift
  [ "$argument" = "--" ] && continue
  set -- "$@" "$argument"
done

exec pnpm exec vitest "$@"
