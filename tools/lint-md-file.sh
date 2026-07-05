#!/usr/bin/env sh
# Scoped per-file variant of tools/lint-md.sh: the same two linters —
# markdownlint for style, then tools/check-doc-links.ts (links, anchors, prose
# rules) — over the files passed as arguments instead of the git selection, so
# `pnpm run lint:md:file -- <file ...>` applies the full lint:md rule set.
set -eu

# The lint:md:file script chain forwards a literal `--` separator; drop it.
while [ "${1:-}" = "--" ]; do
  shift
done

if [ "$#" -eq 0 ]; then
  echo "usage: lint-md-file.sh <file.md ...>" >&2
  exit 1
fi

markdownlint-cli2 --no-globs "$@"
tsx "$(dirname -- "$0")/check-doc-links.ts" "$@"
