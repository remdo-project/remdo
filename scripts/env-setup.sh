#!/usr/bin/env bash
set -Eeuo pipefail

# ---- args --------------------------------------------------------------------
COLLAB=false
PLAYWRIGHT=false

while [[ $# -gt 0 ]]; do
  case "$1" in
    --collab) COLLAB=true; shift ;;
    --playwright) PLAYWRIGHT=true; shift ;;
    -h|--help)
      echo "Usage: $0 [--collab] [--skip-playwright]"; exit 0 ;;
    *) echo "Unknown arg: $1" >&2; exit 1 ;;
  esac
done

npm ci --no-audit --no-fund

if [[ $PLAYWRIGHT == true ]]; then
  npx playwright install --with-deps chromium
fi

if [[ $COLLAB == true ]]; then
  scripts/collab-server.sh
fi
