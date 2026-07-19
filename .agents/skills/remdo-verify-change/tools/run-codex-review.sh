#!/usr/bin/env sh
# Run Codex's native review while exposing only its final report.
# Usage:
#   run-codex-review.sh working-tree
#   run-codex-review.sh committed-range <base-sha>
set -eu

fail() {
  echo "run-codex-review: $1" >&2
  exit 1
}

command -v codex >/dev/null 2>&1 || fail "codex is unavailable"

scope=${1-}
tmp=$(mktemp -d "${TMPDIR:-/tmp}/remdo-codex-review.XXXXXX")
report=$tmp/report
log=$tmp/log
normalized=$tmp/normalized
completion_prompt='After native review completes, place REMDO_CODE_REVIEW_COMPLETE on its own line immediately before the complete final review report. If review cannot complete, do not emit the marker.'

cleanup() {
  rm -rf -- "$tmp"
}
trap cleanup EXIT HUP INT TERM

run_review() {
  if "$@" >"$log" 2>&1; then
    if [ ! -s "$report" ]; then
      echo "run-codex-review: review completed without a final report" >&2
      tail -n 80 "$log" >&2
      exit 1
    fi
    marker_count=$(grep -cx 'REMDO_CODE_REVIEW_COMPLETE' "$report" || true)
    if [ "$marker_count" -ne 1 ]; then
      echo "run-codex-review: review did not provide explicit completion evidence" >&2
      tail -n 80 "$log" >&2
      exit 1
    fi
    awk 'found { print } $0 == "REMDO_CODE_REVIEW_COMPLETE" { found = 1 }' "$report" >"$normalized"
    if ! LC_ALL=C grep -q '[^[:space:]]' "$normalized"; then
      echo "run-codex-review: review completed without a final report" >&2
      tail -n 80 "$log" >&2
      exit 1
    fi
    cat "$normalized"
    return
  else
    status=$?
  fi

  echo "run-codex-review: codex failed with status $status" >&2
  tail -n 80 "$log" >&2
  exit "$status"
}

case "$scope" in
  working-tree)
    [ "$#" -eq 1 ] || fail "working-tree scope takes no revisions"
    run_review codex exec --sandbox read-only review --uncommitted --ephemeral \
      --output-last-message "$report" "$completion_prompt"
    ;;
  committed-range)
    [ "$#" -eq 2 ] || fail "committed-range scope requires a base SHA"
    base=$2
    run_review codex exec --sandbox read-only review --base "$base" --ephemeral \
      --output-last-message "$report" "$completion_prompt"
    ;;
  *)
    fail "expected 'working-tree' or 'committed-range' scope"
    ;;
esac
