#!/bin/sh
# Run the remdo-docs-align skill's private doc-invariant rules (temporal
# wording, References shape) over docs/ — the skill's stage-1 gate beside the
# product's `pnpm run lint:md`. Run from the repo root; exits non-zero on any
# finding.
set -eu
exec node "$(dirname "$0")/run-doc-rules.mjs"
