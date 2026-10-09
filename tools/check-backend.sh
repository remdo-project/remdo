#!/usr/bin/env sh
set -eu
cd "$(dirname "$0")/.."
# Static verification must not connect to an operator database.
export DATABASE_URL=
uv run --locked ruff check backend plugins
uv run --locked ruff format --check backend plugins
./tools/django.sh check
./tools/django.sh makemigrations --check --dry-run
