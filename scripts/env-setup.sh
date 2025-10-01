#!/usr/bin/env bash
# scripts/env-setup.sh
# Minimal, detached environment bootstrap for CI/Codex/local.
set -Eeuo pipefail

# ---- hardcoded settings (keep simple) ----------------------------------------
TIMEOUT_MS=20000     # wait up to 20s for the collab websocket to accept connections
HOST=127.0.0.1
PORT="${REMDO_WS_PORT:-8080}"

# ---- args --------------------------------------------------------------------
COLLAB=false
SKIP_PLAYWRIGHT=false

while [[ $# -gt 0 ]]; do
  case "$1" in
    --collab) COLLAB=true; shift ;;
    --skip-playwright) SKIP_PLAYWRIGHT=true; shift ;;
    -h|--help)
      echo "Usage: $0 [--collab] [--skip-playwright]"; exit 0 ;;
    *) echo "Unknown arg: $1" >&2; exit 1 ;;
  esac
done

# ---- deps --------------------------------------------------------------------
npm ci --no-audit --no-fund
$SKIP_PLAYWRIGHT || npx playwright install --with-deps chromium || true

# ---- optionally start collab websocket (detached) ----------------------------
if $COLLAB; then
  # Start if port not yet accepting connections
  node -e '
    const net=require("net");
    const [h,p]=process.argv.slice(1); const s=net.connect({host:h,port:+p},()=>{s.end();process.exit(0);});
    s.on("error",()=>process.exit(1));
  ' "$HOST" "$PORT" >/dev/null 2>&1 || {
    nohup npm run --silent websocket >/tmp/remdo-ws.log 2>&1 &
  }

  # Wait until port is live (or fail)
  node -e '
    const net=require("net");
    const [h,p,ms]=process.argv.slice(1); const deadline=Date.now()+(+ms);
    (function tryConnect(){
      const s=net.connect({host:h,port:+p},()=>{s.end();process.exit(0);});
      s.on("error",()=>{s.destroy(); Date.now()>deadline?process.exit(1):setTimeout(tryConnect,250);});
    })();
  ' "$HOST" "$PORT" "$TIMEOUT_MS" || {
    echo "[env-setup] websocket failed to start on ${HOST}:${PORT} within ${TIMEOUT_MS}ms" >&2
    tail -n 80 /tmp/remdo-ws.log 2>/dev/null || true
    exit 1
  }

  echo "[env-setup] websocket is up on ${HOST}:${PORT}"
fi
