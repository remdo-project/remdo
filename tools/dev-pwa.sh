#!/usr/bin/env sh
set -eu

PREVIEW_PORT="${PORT}" pnpm run build
PREVIEW_PORT="${PORT}" concurrently \
  "pnpm run build:watch" \
  "pnpm run dev:api" \
  "pnpm run dev:collab" \
  "pnpm run preview"
