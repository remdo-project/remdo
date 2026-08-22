#!/usr/bin/env sh
# Resolve committed agent settings with the optional machine-local overlay.
# Usage: resolve-agent-settings.sh
set -eu
dir=$(CDPATH= cd -- "$(dirname "$0")" && pwd)
exec node "$dir/resolve-agent-settings.mjs" "$@"
