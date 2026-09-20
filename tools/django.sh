#!/usr/bin/env sh
set -eu
cd "$(dirname "$0")/.."
if [ "${1:-}" = test ]; then
  export DJANGO_SETTINGS_MODULE=remdo.testing
  # Only the verification wrapper may supply an external test database.
  if [ -z "${PG_RUNTIME:-}" ]; then
    export DATABASE_URL=
  fi
  # manage.py runs from the repository root, where discovery finds no tests, so
  # supply the labels unless the caller named one. Options alone are not labels.
  has_label=false
  for argument in "$@"; do
    case "${argument}" in
      test | -*) ;;
      *) has_label=true ;;
    esac
  done
  if [ "${has_label}" = false ]; then
    shift
    set -- test accounts documents fixtures remdo "$@"
  fi
fi
exec ./tools/env.sh uv run --locked python backend/manage.py "$@"
