#!/usr/bin/env bash
set -Eeuo pipefail

scripts/collab-server.sh

exec "$@"
