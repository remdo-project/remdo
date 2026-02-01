#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd -- "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LEXICAL_PACKAGE="${ROOT_DIR}/node_modules/lexical/package.json"
VENDOR_DIR="${ROOT_DIR}/data/.vendor/lexical"
VENDOR_PACKAGE="${VENDOR_DIR}/packages/lexical/package.json"

if [[ ! -f "${LEXICAL_PACKAGE}" ]]; then
  echo "Missing lexical package. Run pnpm install first." >&2
  exit 1
fi

LEXICAL_VERSION="$(node -p "require('${LEXICAL_PACKAGE}').version")"
TAG="v${LEXICAL_VERSION}"

if [[ -f "${VENDOR_PACKAGE}" ]]; then
  VENDOR_VERSION="$(node -p "require('${VENDOR_PACKAGE}').version")"
  if [[ "${VENDOR_VERSION}" == "${LEXICAL_VERSION}" ]]; then
    echo "Lexical vendor already at ${TAG}."
    exit 0
  fi
fi

mkdir -p "${ROOT_DIR}/data/.vendor"
rm -rf "${VENDOR_DIR}"
git -C "${ROOT_DIR}/data/.vendor" -c advice.detachedHead=false clone --depth 1 \
  --branch "${TAG}" https://github.com/facebook/lexical.git lexical
