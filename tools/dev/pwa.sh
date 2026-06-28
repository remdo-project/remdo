#!/usr/bin/env sh
# Serve the PWA preview beside `pnpm run dev` on a +20 port range.
#
# PORT_BASE is the single dev port knob, so a +20 range is just a shifted
# PORT_BASE: resolve the base once, then re-run env.sh with PORT_BASE+20 so PORT
# and every derived service port land 20 above the main dev range. The PWA build
# and preview both serve on that shifted PORT.
set -eu

ROOT_DIR="$(CDPATH= cd -- "$(dirname "$0")/../.." && pwd)"

# First env.sh pass resolves PORT_BASE from process env and .env. The inner pass
# re-derives every port from the shifted base; clear the already-derived ports
# (and YSWEET_CONNECTION_STRING, derived from COLLAB_SERVER_PORT) so they
# recompute instead of being inherited from the outer pass. PORT is pinned
# explicitly rather than `env -u`-cleared: the inner env.sh re-sources .env, which
# would re-apply a `.env`-pinned PORT and defeat the +20 shift, so we set it.
exec "${ROOT_DIR}/tools/env.sh" sh -c '
  env \
    -u HMR_PORT -u VITEST_PORT -u VITEST_PREVIEW_PORT \
    -u COLLAB_SERVER_PORT -u PREVIEW_PORT -u PLAYWRIGHT_UI_PORT -u API_SERVER_PORT \
    -u YSWEET_CONNECTION_STRING \
    PORT_BASE="$((PORT_BASE + 20))" \
    PORT="$((PORT_BASE + 20))" \
    "'"${ROOT_DIR}"'/tools/env.sh" sh -c '\''
      PREVIEW_PORT="$PORT" pnpm run build \
        && PREVIEW_PORT="$PORT" concurrently \
          "pnpm run build:watch" \
          "pnpm run dev:api" \
          "pnpm run dev:collab" \
          "pnpm run preview:web"
    '\''
'
