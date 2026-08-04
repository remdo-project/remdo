#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd -- "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

# The preflight prints the validated source origin itself.
"${ROOT_DIR}/tools/env.sh" pnpm exec tsx ./tools/dev/linking-preflight.ts

HOME_ORIGIN="$("${ROOT_DIR}/tools/env.sh" --port-base-offset 40 pnpm exec tsx ./tools/dev/print-app-public-url.ts)"

echo "Private home: ${HOME_ORIGIN}"
echo "After enrollment, link the source from ${HOME_ORIGIN}/sharing"

exec pnpm run dev:docker
