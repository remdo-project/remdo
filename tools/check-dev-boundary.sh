#!/usr/bin/env sh
# Guards the dev/prod boundary (docs/dev/dev-tooling.md): dev-only tooling must
# not ship in the production bundle. Runs a real production build and fails if
# any dev-tooling marker survives dead-code elimination.
#
# Usage: sh tools/check-dev-boundary.sh
#   Builds with NODE_ENV=production (the same mode docker/Dockerfile uses) into
#   dist/, then greps the emitted JS for markers that only exist in dev tooling.
set -eu

root_dir=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
cd "$root_dir"

echo "check-dev-boundary: building production bundle…"
NODE_ENV=production ./tools/env.sh pnpm run build >/dev/null

# Markers that appear only in dev tooling. Each is a string literal or symbol
# emitted by a dev module (schema assertion, tree view, test bridge, dev toolbar,
# vanilla demo editor, dev route). If any survives in the prod bundle, a dev
# surface leaked past its import.meta.env.DEV gate.
markers="indent-jump LexicalTreeView __remdoTestBridges remdo-vanilla-lexical DevLexicalDemoRoute __vitest__"

leaked=""
for marker in $markers; do
  if grep -rlF "$marker" dist/app-assets/ dist/sw.js >/dev/null 2>&1; then
    leaked="$leaked $marker"
  fi
done

if [ -n "$leaked" ]; then
  echo "check-dev-boundary: FAIL — dev-tooling markers found in the prod bundle:$leaked" >&2
  echo "check-dev-boundary: a dev surface is reachable from production code — gate it behind import.meta.env.DEV (see docs/dev/dev-tooling.md)." >&2
  exit 1
fi

echo "check-dev-boundary: OK — no dev-tooling markers in the production bundle."
