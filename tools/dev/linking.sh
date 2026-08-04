#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd -- "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

"${ROOT_DIR}/tools/env.sh" pnpm exec tsx ./tools/dev/linking-preflight.ts

SOURCE_ORIGIN="$("${ROOT_DIR}/tools/env.sh" pnpm exec tsx ./tools/dev/print-app-public-url.ts)"
HOME_ORIGIN="$("${ROOT_DIR}/tools/env.sh" --port-base-offset 40 pnpm exec tsx ./tools/dev/print-app-public-url.ts)"

echo "Source: ${SOURCE_ORIGIN}"
echo "Private home: ${HOME_ORIGIN}"
echo "After enrollment, link the source from ${HOME_ORIGIN}/sharing"

exec "${ROOT_DIR}/tools/dev/docker.sh" --network=host
