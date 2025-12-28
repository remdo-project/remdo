#!/usr/bin/env bash
set -euo pipefail


#FIXME
#  - Medium: hardcoded remote path ignores prod DATA_DIR config — tools/make-backup.sh:13,27,44 uses REMOTE_DATA_DIR="${ROOT_DIR}/data". With the recent prod changes, the
#    authoritative host path is the DATA_DIR value in .env; if prod isn’t using ${ROOT_DIR}/data, scp will fetch the wrong location or fail.
#  - Medium: markdown diff runs in the app repo, not the backup repo — tools/make-backup.sh:48-49. Since the fetched files land in LOCAL_DATA_DIR, this diff won’t show the backup
#    changes you just pulled.
#  - Low: scp -r merges into existing backup/ — tools/make-backup.sh:27-28. If prod deletes a backup file, it won’t disappear locally, so diffs/commits can drift unless you clear
#    or replace the directory each run.
#
#  Assumptions / questions
#
#  - Is prod DATA_DIR always ${ROOT_DIR}/data on the host (matching this script), or should we read DATA_DIR from .env to align with docker/run.sh?
#  - Should the markdown diff target the backup repo (LOCAL_DATA_DIR) rather than the app repo?
#  - Do you want a clean snapshot each run (clear/replace backup/), or is merge behavior intentional?



# Fetches backups and collab data from prod, then shows markdown diff.
# Required: PROD_HOST (ssh target, sourced from .env).

ROOT_DIR="$(git rev-parse --show-toplevel)"
# shellcheck disable=SC1090 # allow sourcing repo-local .env
. "${ROOT_DIR}/.env"

: "${PROD_HOST:?Set PROD_HOST in .env (ssh target)}"
LOCAL_DATA_DIR="${LOCAL_DATA_DIR:-${ROOT_DIR}/data/backup-repo}"
REMOTE_DATA_DIR="${ROOT_DIR}/data"
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

# Review markdown changes.
git -C "${ROOT_DIR}" diff -- '*.md'

if read -r -p "Commit backup repo changes? [Y/n] " && [[ -z "${REPLY:-}" || "${REPLY}" == "y" || "${REPLY}" == "Y" ]]; then
  git -C "${LOCAL_DATA_DIR}" add -A
  if git -C "${LOCAL_DATA_DIR}" diff --cached --quiet; then
    echo "No backup repo changes to commit."
  else
    git -C "${LOCAL_DATA_DIR}" commit -m "backup: ${BIN_BASE}${BIN_SUFFIX}"
  fi
fi
