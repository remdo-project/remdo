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

# ---- deps --------------------------------------------------------------------
npm ci --no-audit --no-fund
$PLAYWRIGHT && npx playwright install --with-deps chromium

$COLLAB && scripts/collab-server.sh
