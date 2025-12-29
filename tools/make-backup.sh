#!/usr/bin/env bash
set -euo pipefail


# Assumptions:
# - Prod repo path matches the local repo path, so DATA_DIR resolves identically.
# - scp merges into existing backup/; delete it manually if you want a clean sync.



# Fetches backups and collab data from prod, then shows markdown diff.
# Required: PROD_HOST (ssh target, sourced from .env).

ROOT_DIR="$(git rev-parse --show-toplevel)"
# shellcheck disable=SC1090 # allow sourcing repo-local .env
. "${ROOT_DIR}/.env"
# shellcheck disable=SC1091 # shared defaults live in the repo.
REMDO_ROOT="${ROOT_DIR}" . "${ROOT_DIR}/tools/env.defaults.sh"

: "${PROD_HOST:?Set PROD_HOST in .env (ssh target)}"
LOCAL_DATA_DIR="${LOCAL_DATA_DIR:-${ROOT_DIR}/data/backup-repo}"
REMOTE_DATA_DIR="${DATA_DIR}"
STAMP="$(date +%y-%m-%d)"

# Ensure backups land in a separate git backup repo (not the app repo).
BACKUP_REPO_ROOT="$(git -C "${LOCAL_DATA_DIR}" rev-parse --show-toplevel 2>/dev/null || true)"
if [[ -z "${BACKUP_REPO_ROOT}" ]]; then
  echo "LOCAL_DATA_DIR is not a git repo. Init one before running this script." >&2
  exit 1
fi
if [[ "${BACKUP_REPO_ROOT}" == "${ROOT_DIR}" ]]; then
  echo "LOCAL_DATA_DIR points at the app repo. Use a separate backup repo." >&2
  exit 1
fi

# Pull backups (host: ${REMOTE_DATA_DIR}/backup) into data/backup.
scp -r "${PROD_HOST}:${REMOTE_DATA_DIR}/backup" "${LOCAL_DATA_DIR}/"

# Copy binary y-sweet data into a dated archive
# This keeps the full collab directory structure.
BIN_BASE="ysweet-${STAMP}"
BIN_SUFFIX=""
BIN_INDEX=0
while [[ -e "${LOCAL_DATA_DIR}/${BIN_BASE}${BIN_SUFFIX}.tar.gz" || -e "${LOCAL_DATA_DIR}/${BIN_BASE}${BIN_SUFFIX}" ]]; do
  BIN_INDEX=$((BIN_INDEX + 1))
  BIN_SUFFIX="-$(printf '%02d' "${BIN_INDEX}")"
done

BIN_DIR="${LOCAL_DATA_DIR}/${BIN_BASE}${BIN_SUFFIX}"
BIN_ARCHIVE="${LOCAL_DATA_DIR}/${BIN_BASE}${BIN_SUFFIX}.tar.gz"

mkdir -p "${BIN_DIR}"
scp -r "${PROD_HOST}:${REMOTE_DATA_DIR}/collab" "${BIN_DIR}/"
GZIP=-9 tar -czf "${BIN_ARCHIVE}" -C "${BIN_DIR}" collab
rm -rf "${BIN_DIR}"

# Review markdown changes in the backup repo.
git -C "${LOCAL_DATA_DIR}" diff -- '*.md'

if read -r -p "Commit backup repo changes? [Y/n] " && [[ -z "${REPLY:-}" || "${REPLY}" == "y" || "${REPLY}" == "Y" ]]; then
  git -C "${LOCAL_DATA_DIR}" add -A
  if git -C "${LOCAL_DATA_DIR}" diff --cached --quiet; then
    echo "No backup repo changes to commit."
  else
    git -C "${LOCAL_DATA_DIR}" commit -m "backup: ${BIN_BASE}${BIN_SUFFIX}"
  fi
fi
