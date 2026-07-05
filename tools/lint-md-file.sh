#!/usr/bin/env sh
# Loud per-file markdown lint: `markdownlint-cli2 --no-globs` treats a missing or
# ignored path as "Linting: 0 file(s)" and exits 0, so a typo'd or gitignored
# path passes silently. This wrapper refuses that: it requires at least one path,
# fails if any named path is missing on disk, and fails if cli2 ends up linting
# zero files (e.g. every path was ignored). Passes the paths straight through
# otherwise.
# Usage: lint-md-file.sh <file ...>
set -eu

fail() {
  echo "lint-md-file: $1" >&2
  exit 1
}

# `pnpm run lint:md:file -- <file>` forwards a leading `--` separator; drop it so
# it isn't mistaken for a path.
[ "${1-}" = "--" ] && shift

[ "$#" -ge 1 ] || fail "no files given (usage: lint-md-file.sh <file ...>)"

for f in "$@"; do
  [ -e "$f" ] || fail "path does not exist: $f"
done

# Capture stdout so we can inspect the "Linting: N file(s)" count while still
# showing it; cli2's own exit status still gates on lint errors.
out=$(pnpm exec markdownlint-cli2 --no-globs "$@" 2>&1) && status=0 || status=$?
printf '%s\n' "$out"

if printf '%s\n' "$out" | grep -q '^Linting: 0 file(s)'; then
  fail "0 files linted — every path was ignored (gitignore / .markdownlint-cli2.jsonc ignores)"
fi

exit "$status"
