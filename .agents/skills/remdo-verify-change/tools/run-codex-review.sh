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
command -v python3 >/dev/null 2>&1 || fail "python3 is unavailable"

scope=${1-}
tmp=$(mktemp -d "${TMPDIR:-/tmp}/remdo-codex-review.XXXXXX")
report=$tmp/report
events=$tmp/events
diagnostics=$tmp/diagnostics

cleanup() {
  rm -rf -- "$tmp"
}
trap cleanup EXIT HUP INT TERM

run_review() {
  if "$@" >"$events" 2>"$diagnostics"; then
    if [ ! -s "$report" ]; then
      echo "run-codex-review: review completed without a final report" >&2
      tail -n 80 "$diagnostics" >&2
      tail -n 80 "$events" >&2
      exit 1
    fi
    if python3 - "$events" "$report" <<'PYEOF'
import json
import sys

events_path = sys.argv[1]
report_path = sys.argv[2]
try:
    with open(events_path, encoding="utf-8") as handle:
        events = [json.loads(line) for line in handle if line.strip()]
except (OSError, UnicodeError, json.JSONDecodeError) as error:
    sys.stderr.write(f"run-codex-review: could not parse Codex event stream: {error}\n")
    sys.exit(1)

if not any(isinstance(event, dict) and event.get("type") == "turn.completed" for event in events):
    sys.stderr.write("run-codex-review: review did not provide explicit completion evidence\n")
    sys.exit(1)

try:
    with open(report_path, encoding="utf-8") as handle:
        body = handle.read()
except (OSError, UnicodeError) as error:
    sys.stderr.write(f"run-codex-review: could not read final report: {error}\n")
    sys.exit(1)

report = body.strip()
if not report:
    sys.stderr.write("run-codex-review: review completed without a final report\n")
    sys.exit(1)

agent_messages = [
    event.get("item", {}).get("text")
    for event in events
    if isinstance(event, dict)
    and event.get("type") == "item.completed"
    and isinstance(event.get("item"), dict)
    and event["item"].get("type") == "agent_message"
]
if not agent_messages or not isinstance(agent_messages[-1], str) or agent_messages[-1].strip() != report:
    sys.stderr.write("run-codex-review: final report did not match the completed Codex review output\n")
    sys.exit(1)

sys.stdout.write(report)
if not report.endswith("\n"):
    sys.stdout.write("\n")
PYEOF
    then
      return
    else
      status=$?
      tail -n 80 "$diagnostics" >&2
      tail -n 80 "$events" >&2
      exit "$status"
    fi
  else
    status=$?
  fi

  echo "run-codex-review: codex failed with status $status" >&2
  tail -n 80 "$diagnostics" >&2
  tail -n 80 "$events" >&2
  exit "$status"
}

case "$scope" in
  working-tree)
    [ "$#" -eq 1 ] || fail "working-tree scope takes no revisions"
    run_review codex exec --sandbox read-only review --uncommitted --ephemeral \
      --json --output-last-message "$report"
    ;;
  committed-range)
    [ "$#" -eq 2 ] || fail "committed-range scope requires a base SHA"
    base=$2
    run_review codex exec --sandbox read-only review --base "$base" --ephemeral \
      --json --output-last-message "$report"
    ;;
  *)
    fail "expected 'working-tree' or 'committed-range' scope"
    ;;
esac
