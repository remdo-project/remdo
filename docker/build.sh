#!/usr/bin/env bash
set -euo pipefail

docker build -f docker/Dockerfile \
  --build-arg PUBLIC_PORT=8080 \
  -t remdo:single \
  .
