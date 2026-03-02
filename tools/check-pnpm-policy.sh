#!/usr/bin/env bash
set -euo pipefail

awk '
  /^trustPolicyExclude:/ { in_list = 1; next }
  in_list && /^[^[:space:]]/ { in_list = 0 }
  in_list && /^[[:space:]]*-[[:space:]]*/ {
    sub(/^[[:space:]]*-[[:space:]]*/, "", $0)
    print $0
  }
' pnpm-workspace.yaml | while IFS= read -r entry; do
  escaped="$(printf '%s' "$entry" | sed -E 's/[][(){}.^$*+?|\\]/\\&/g')"
  grep -Eq "^  ${escaped}:" pnpm-lock.yaml || {
    echo "stale trustPolicyExclude entry: $entry"
    exit 1
  }
done

echo "pnpm trust policy excludes are active"
