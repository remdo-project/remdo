#!/usr/bin/env bash
set -euo pipefail

# Opens SSH forwards for RemDo ports on a remote dev machine.

[[ "$#" -eq 1 ]] || { echo "Usage: open-remdo-tunnel.sh [user@]host:PORT_BASE" >&2; exit 1; }

ssh_target="${1%:*}"
base_port="${1##*:}"
[[ "${ssh_target}" != "$1" && -n "${ssh_target}" && "${base_port}" =~ ^[0-9]+$ ]] || {
  echo "Expected [user@]host:port, got: $1" >&2
  exit 1
}

last_port=$((base_port + 99))
ssh_args=(-N)
for ((port = base_port; port <= last_port; port += 1)); do
  ssh_args+=(-L "${port}:localhost:${port}")
done

echo "Forwarding ${base_port}-${last_port} through ${ssh_target}. Press Ctrl-C to stop."
exec ssh "${ssh_args[@]}" "${ssh_target}"
