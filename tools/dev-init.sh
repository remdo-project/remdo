#!/usr/bin/env bash

pnpm i --frozen-lockfile

PLAYWRIGHT_INSTALL="${PLAYWRIGHT_INSTALL:-false}"

if [[ "${PLAYWRIGHT_INSTALL}" == "true" ]]; then
  pnpm exec playwright install chromium
else
  echo "Skipping Playwright browser install (PLAYWRIGHT_INSTALL=${PLAYWRIGHT_INSTALL})"
fi

./tools/vendor-lexical.sh
