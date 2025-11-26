#!/usr/bin/env bash
set -euo pipefail

docker run --rm \
  -e APP_PORT=8080 \
  -e YSWEET_PORT_INTERNAL=8081 \
  -p 8080:8080 \
  remdo:single
