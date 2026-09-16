#!/usr/bin/env sh
set -eu
cd "$(dirname "$0")/.."
./tools/django.sh migrate --noinput
./tools/django.sh setup_development_users
exec ./tools/django.sh runserver "127.0.0.1:${API_SERVER_PORT}"
