#!/usr/bin/env bash

pnpm i --frozen-lockfile

PLAYWRIGHT_INSTALL="${PLAYWRIGHT_INSTALL:-false}"

if [[ "${PLAYWRIGHT_INSTALL}" == "true" ]]; then
  pnpm exec playwright install chromium
else
  echo "Skipping Playwright browser install (PLAYWRIGHT_INSTALL=${PLAYWRIGHT_INSTALL})"
fi

TAG="v$(node -p "require('./node_modules/lexical/package.json').version")"

rm -rf data/.vendor/lexical
git -C data/.vendor -c advice.detachedHead=false clone --depth 1 \
  --branch "$TAG" https://github.com/facebook/lexical.git lexical
