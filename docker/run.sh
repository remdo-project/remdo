#!/usr/bin/env bash
set -euo pipefail

BASICAUTH_USER="$(id -un)"
PASSWORD_FILE="${PASSWORD_FILE:-${HOME}/.password}"

# Cross-platform permission check (GNU/BSD stat)
perm="$(stat -c '%a' "${PASSWORD_FILE}" 2>/dev/null || stat -f '%OLp' "${PASSWORD_FILE}" 2>/dev/null || echo '')"
if [[ "${perm}" != "600" ]]; then
  echo "Password file permissions must be 600 (current: ${perm:-unknown}). Fix with: chmod 600 ${PASSWORD_FILE}" >&2
  exit 1
fi

BASICAUTH_PASSWORD="$(tr -d '\r\n' < "${PASSWORD_FILE}")"

if [[ -z "${BASICAUTH_PASSWORD}" ]]; then
  echo "Password is required." >&2
  exit 1
fi

if (( ${#BASICAUTH_PASSWORD} < 10 )); then
  echo "Password must be at least 10 characters." >&2
  exit 1
fi

export BASICAUTH_USER BASICAUTH_PASSWORD

docker run --rm \
  -e APP_PORT=8080 \
  -e YSWEET_PORT_INTERNAL=8081 \
  -e BASICAUTH_USER \
  -e BASICAUTH_PASSWORD \
  -p 8080:8080 \
  remdo
