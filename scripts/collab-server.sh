#!/usr/bin/env bash
set -Eeuo pipefail

TIMEOUT_MS=5000
HOST="${HOST:-127.0.0.1}"
PORT="${PORT:-8080}"

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
