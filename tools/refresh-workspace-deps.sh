#!/usr/bin/env sh

set -eu

pnpm update --latest --workspace-root
pnpm run lint
pnpm run test:unit
pnpm run test:collab
