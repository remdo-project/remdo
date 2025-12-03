#!/usr/bin/env bash

pnpm i --frozen-lockfile

if [[ -n "${PLAYWRIGHT_SKIP_INSTALL:-}" ]]; then
  echo "Skipping Playwright browser install (PLAYWRIGHT_SKIP_INSTALL=1)"
else
  pnpm exec playwright install chromium
fi

TAG="v$(node -p "require('./node_modules/lexical/package.json').version")"

rm -rf data/.vendor/lexical
git -C data/.vendor -c advice.detachedHead=false clone --depth 1 \
  --branch "$TAG" https://github.com/facebook/lexical.git lexical
