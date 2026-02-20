#!/usr/bin/env bash
set -euo pipefail

# Fetches backups and collab data from prod, then shows markdown diff.
# Required: PROD_APP_ADDR (default remote repo dir, sourced from .env).
# Optional: PROD_APP_ADDR_<suffix> extra targets (suffix must be alphanumeric).

ROOT_DIR="$(git rev-parse --show-toplevel)"
# shellcheck disable=SC1090 # allow sourcing repo-local .env
. "${ROOT_DIR}/.env"

LOCAL_DATA_DIR="${ROOT_DIR}/data/backup-repo"
STAMP="$(date +%y-%m-%d_%H-%M)"
TARGETS=(default)

while IFS= read -r REMOTE_ADDR_VAR; do
  TARGET="${REMOTE_ADDR_VAR#PROD_APP_ADDR_}"
  if [[ "${TARGET}" =~ ^[[:alnum:]]+$ && "${TARGET}" != "default" ]]; then
    TARGETS+=("${TARGET}")
  fi
done < <(compgen -A variable PROD_APP_ADDR_ | sort)

# Ensure backups land in a separate git backup repo (not the app repo).
if [[ "$(git -C "${LOCAL_DATA_DIR}" rev-parse --show-toplevel 2>/dev/null || true)" == "${ROOT_DIR}" ]]; then
  echo "LOCAL_DATA_DIR points at the app repo. Use a separate backup repo." >&2
  exit 1
fi

mkdir -p "${LOCAL_DATA_DIR}/hosts" "${LOCAL_DATA_DIR}/archives"

for TARGET in "${TARGETS[@]}"; do
  if [[ "${TARGET}" == "default" ]]; then
    REMOTE_APP_ADDR="${PROD_APP_ADDR:?Set PROD_APP_ADDR in .env (e.g. deploy@prod.example.com:~/projects/remdo)}"
  else
    REMOTE_ADDR_VAR="PROD_APP_ADDR_${TARGET}"
    REMOTE_APP_ADDR="${!REMOTE_ADDR_VAR:?Set ${REMOTE_ADDR_VAR} in .env (e.g. deploy@prod.example.com:~/projects/remdo)}"
  fi

  REMOTE_APP_ADDR="${REMOTE_APP_ADDR%/}"
  REMOTE_DATA_DIR="${REMOTE_APP_ADDR}/data"
  TARGET_DIR="${LOCAL_DATA_DIR}/hosts/${TARGET}"
  BIN_DIR="${LOCAL_DATA_DIR}/.tmp-ysweet-${TARGET}-${STAMP}"
  BIN_ARCHIVE="${LOCAL_DATA_DIR}/archives/ysweet-${TARGET}-${STAMP}.tar.gz"

  echo "Fetching backup target: ${TARGET}"
  rm -rf "${TARGET_DIR}/backup" "${BIN_DIR}"
  mkdir -p "${TARGET_DIR}" "${BIN_DIR}"
  scp -r "${REMOTE_DATA_DIR}/backup" "${TARGET_DIR}/"
  scp -r "${REMOTE_DATA_DIR}/collab" "${BIN_DIR}/"
  tar -C "${BIN_DIR}" -czf "${BIN_ARCHIVE}" collab
  rm -rf "${BIN_DIR}"
done

# Shows the changes to the user before offering commit.
git -C "${LOCAL_DATA_DIR}" diff -- ':(glob)hosts/*/backup/**/*.md'

if read -r -p "Commit backup repo changes? [Y/n] " && [[ -z "${REPLY:-}" || "${REPLY}" == "y" || "${REPLY}" == "Y" ]]; then
  TARGET_LIST="$(printf '%s, ' "${TARGETS[@]}")"
  TARGET_LIST="${TARGET_LIST%, }"
  git -C "${LOCAL_DATA_DIR}" add -A
  git -C "${LOCAL_DATA_DIR}" commit -m "backup: ysweet-${STAMP} (${TARGET_LIST})"
fi
