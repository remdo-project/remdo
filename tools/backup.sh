#!/usr/bin/env bash
set -euo pipefail

TARGET_ROOT=${1:-./data}
TARGET_DIR="${TARGET_ROOT%/}/backup"

mkdir -p "$TARGET_DIR"
pnpm save "$TARGET_DIR/main" --md
pnpm save "$TARGET_DIR/project" --doc project --md
