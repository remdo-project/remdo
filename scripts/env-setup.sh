#!/usr/bin/env bash
set -Eeuo pipefail

# ---- args --------------------------------------------------------------------
PLAYWRIGHT=false

if [[ $# -eq 1 && $1 == "--playwright" ]]; then
  PLAYWRIGHT=true
elif [[ $# -gt 0 ]]; then
  echo "Usage: $0 [--playwright]" >&2
  exit 1
fi

npm ci --no-audit --no-fund

if [[ $PLAYWRIGHT == true ]]; then
  npx playwright install --with-deps chromium
fi
