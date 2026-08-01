#!/usr/bin/env sh
# Serve the PWA preview beside `pnpm run dev` on a +20 port range.
set -eu

ROOT_DIR="$(CDPATH= cd -- "$(dirname "$0")/../.." && pwd)"

exec "${ROOT_DIR}/tools/env.sh" --port-base-offset 20 sh -c '
  PREVIEW_PORT="$PORT" pnpm run build \
    && PREVIEW_PORT="$PORT" concurrently \
      "pnpm run build:watch" \
      "pnpm run dev:api" \
      "pnpm run dev:collab" \
      "pnpm run preview:web"
'
