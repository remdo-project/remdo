#!/usr/bin/env sh
set -eu
cd "$(dirname "$0")/.."
uv run --locked ruff check backend
uv run --locked ruff format --check backend
./tools/django.sh check
./tools/django.sh makemigrations --check --dry-run
