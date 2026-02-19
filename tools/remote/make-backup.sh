#!/usr/bin/env bash
set -euo pipefail

# Fetches backups and collab data from prod, then shows markdown diff.
# Required: PROD_APP_ADDR (remote repo dir, sourced from .env).

ROOT_DIR="$(git rev-parse --show-toplevel)"
# shellcheck disable=SC1090 # allow sourcing repo-local .env
. "${ROOT_DIR}/.env"

REMOTE_APP_ADDR="${PROD_APP_ADDR:?Set PROD_APP_ADDR in .env (e.g. deploy@prod.example.com:~/projects/remdo)}"
REMOTE_APP_ADDR="${REMOTE_APP_ADDR%/}"
REMOTE_DATA_DIR="${REMOTE_APP_ADDR}/data"
LOCAL_DATA_DIR="${ROOT_DIR}/data/backup-repo"
STAMP="$(date +%y-%m-%d_%H-%M)"

# Ensure backups land in a separate git backup repo (not the app repo).
if [[ "$(git -C "${LOCAL_DATA_DIR}" rev-parse --show-toplevel 2>/dev/null || true)" == "${ROOT_DIR}" ]]; then
  echo "LOCAL_DATA_DIR points at the app repo. Use a separate backup repo." >&2
  exit 1
fi

# Pull backup artifacts from prod.
# backup/ is for review/commit; collab/ is archived as a full snapshot.
BIN_DIR="${LOCAL_DATA_DIR}/ysweet-${STAMP}"
BIN_ARCHIVE="${BIN_DIR}.tar.gz"

scp -r "${REMOTE_DATA_DIR}/backup" "${LOCAL_DATA_DIR}/"
rm -rf "${BIN_DIR}"
mkdir -p "${BIN_DIR}"
scp -r "${REMOTE_DATA_DIR}/collab" "${BIN_DIR}/"
tar -C "${BIN_DIR}" -czf "${BIN_ARCHIVE}" collab
rm -rf "${BIN_DIR}"

# Shows the changes to the user before offering commit.
git -C "${LOCAL_DATA_DIR}" diff -- '*.md'

if read -r -p "Commit backup repo changes? [Y/n] " && [[ -z "${REPLY:-}" || "${REPLY}" == "y" || "${REPLY}" == "Y" ]]; then
  git -C "${LOCAL_DATA_DIR}" add -A
  git -C "${LOCAL_DATA_DIR}" commit -m "backup: ysweet-${STAMP}"
fi
