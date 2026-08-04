#!/usr/bin/env sh
# Serve the PWA preview beside `pnpm run dev` on a +20 port range.
set -eu

ROOT_DIR="$(CDPATH='' cd -- "$(dirname "$0")/../.." && pwd)"

# shellcheck disable=SC2016 # expanded by the inner shell after env.sh resolves the shifted stack.
exec "${ROOT_DIR}/tools/env.sh" --port-base-offset 20 sh -c '
  DATA_DIR="${DATA_DIR%/}/pwa-preview"
  export DATA_DIR
  pnpm run build \
    && concurrently --kill-others-on-fail --names build,api,collab,preview,seed \
      "pnpm run build:watch" \
      "pnpm run dev:api" \
      "pnpm run dev:collab" \
      "pnpm run preview:web" \
      "pnpm run dev:seed"
'
