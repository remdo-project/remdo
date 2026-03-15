#!/usr/bin/env sh

set -eu

pnpm update --latest --workspace-root
pnpm exec eslint --fix pnpm-workspace.yaml
pnpm run lint
pnpm run test:unit:full
pnpm run test:collab:full
pnpm run test:e2e
