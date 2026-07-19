#!/usr/bin/env sh
# Run Claude's native /code-review while exposing only its final report.
# Usage:
#   run-claude-review.sh working-tree
#   run-claude-review.sh committed-range <base-sha> <head-sha>
set -eu

fail() {
  echo "run-claude-review: $1" >&2
  exit 1
}

command -v claude >/dev/null 2>&1 || fail "claude is unavailable"
command -v python3 >/dev/null 2>&1 || fail "python3 is unavailable"

scope=${1-}

working_tree_prompt='Review only the current working-tree scope (staged, unstaged, and untracked changes, including separate staged and unstaged versions of one path) under repository rules. After native review completes, place REMDO_CODE_REVIEW_COMPLETE on its own line immediately before the complete final review report, including every finding and its location; do not replace findings with counts or a summary. If review cannot complete, do not emit the marker. Do not edit, stage, commit, or repeat the deterministic checks.'
range_prompt() {
  echo "Review only the exact resolved range \`$1..$2\` under repository rules. After native review completes, place REMDO_CODE_REVIEW_COMPLETE on its own line immediately before the complete final review report, including every finding and its location; do not replace findings with counts or a summary. If review cannot complete, do not emit the marker. Do not edit, stage, commit, or repeat the deterministic checks."
}

case "$scope" in
  working-tree)
    [ "$#" -eq 1 ] || fail "working-tree scope takes no revisions"
    system_prompt=$working_tree_prompt
    command_arg='/code-review'
    ;;
  committed-range)
    [ "$#" -eq 3 ] || fail "committed-range scope requires a base and head SHA"
    base=$2
    head=$3
    system_prompt=$(range_prompt "$base" "$head")
    command_arg="/code-review $base..$head"
    ;;
  *)
    fail "expected 'working-tree' or 'committed-range' scope"
    ;;
esac

tmp=$(mktemp -d "${TMPDIR:-/tmp}/remdo-claude-review.XXXXXX")
raw=$tmp/raw
diagnostics=$tmp/diagnostics

cleanup() {
  rm -rf -- "$tmp"
}
trap cleanup EXIT HUP INT TERM

if claude -p --effort max --permission-mode plan \
  --allowedTools 'Bash,Read,Grep,Glob,Skill,Agent' \
  --append-system-prompt "$system_prompt" \
  --settings '{"disableAllHooks":true}' \
  --no-session-persistence \
  --output-format json \
  "$command_arg" >"$raw" 2>"$diagnostics"; then
  :
else
  status=$?
  echo "run-claude-review: claude failed with status $status" >&2
  tail -n 80 "$diagnostics" >&2
  tail -n 80 "$raw" >&2
  exit "$status"
fi

python3 - "$raw" <<'PYEOF'
import json
import sys

path = sys.argv[1]
with open(path, encoding="utf-8") as handle:
    raw = handle.read()

try:
    data = json.loads(raw)
except json.JSONDecodeError:
    sys.stderr.write("run-claude-review: could not parse claude output as JSON\n")
    sys.stderr.write(raw[-4000:])
    sys.exit(1)

result = data.get("result")
is_error = data.get("is_error", False)

if result and result.strip() == "Unknown command: /code-review":
    sys.stderr.write("run-claude-review: /code-review is unavailable in this session\n")
    sys.exit(2)

if is_error or not result:
    sys.stderr.write(f"run-claude-review: review did not complete cleanly (is_error={is_error})\n")
    sys.stderr.write(json.dumps(data, indent=2)[-4000:])
    sys.exit(1)

body = result.strip()
marker = "REMDO_CODE_REVIEW_COMPLETE"
lines = body.splitlines()
marker_lines = [index for index, line in enumerate(lines) if line.strip() == marker]
if len(marker_lines) != 1:
    sys.stderr.write("run-claude-review: review did not provide explicit completion evidence\n")
    sys.stderr.write(json.dumps(data, indent=2)[-4000:])
    sys.exit(1)

report = "\n".join(lines[marker_lines[0] + 1:]).strip()
if not report:
    sys.stderr.write("run-claude-review: review completed without a final report\n")
    sys.exit(1)

sys.stdout.write(report)
if not report.endswith("\n"):
    sys.stdout.write("\n")
PYEOF
