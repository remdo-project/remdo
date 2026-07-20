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
command -v git >/dev/null 2>&1 || fail "git is unavailable"
command -v python3 >/dev/null 2>&1 || fail "python3 is unavailable"

scope=${1-}
script_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
schema_json=$(cat "$script_dir/review-output.schema.json") \
  || fail "could not read review output schema"
report_instruction='The structured report field must contain the complete final review report, including every finding and its location. Do not replace findings with counts, a summary, or a reference to other output.'

working_tree_prompt="Review only the current working-tree scope (staged, unstaged, and untracked changes, including separate staged and unstaged versions of one path) under repository rules. $report_instruction Do not edit, stage, commit, or repeat the deterministic checks."
range_prompt() {
  echo "Review only the exact resolved range \`$1..$2\` under repository rules. $report_instruction Do not edit, stage, commit, or repeat the deterministic checks."
}

case "$scope" in
  working-tree)
    [ "$#" -eq 1 ] || fail "working-tree scope takes no revisions"
    branch=$(git symbolic-ref --quiet --short HEAD) \
      || fail "working-tree review requires an attached branch"
    merge_refs=$(git config --get-all "branch.$branch.merge" || :)
    [ -n "$merge_refs" ] || merge_refs="refs/heads/$branch"
    # Bare /code-review includes commits ahead of upstream. Give its inherited
    # Git view a synthetic upstream whose merge targets resolve to this branch.
    config_count=${GIT_CONFIG_COUNT:-0}
    case "$config_count" in
      ''|*[!0-9]*) fail "GIT_CONFIG_COUNT must be a non-negative integer" ;;
    esac
    while [ "${config_count#0}" != "$config_count" ]; do
      config_count=${config_count#0}
    done
    config_count=${config_count:-0}
    remote_name="remdo-verify-$$"
    export "GIT_CONFIG_KEY_$config_count=branch.$branch.remote"
    export "GIT_CONFIG_VALUE_$config_count=$remote_name"
    config_count=$((config_count + 1))
    old_ifs=$IFS
    IFS='
'
    for merge_ref in $merge_refs; do
      export "GIT_CONFIG_KEY_$config_count=remote.$remote_name.fetch"
      export "GIT_CONFIG_VALUE_$config_count=+$merge_ref:refs/heads/$branch"
      config_count=$((config_count + 1))
    done
    IFS=$old_ifs
    GIT_CONFIG_COUNT=$config_count
    export GIT_CONFIG_COUNT
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

if claude -p --effort medium --permission-mode dontAsk \
  --allowedTools 'Bash,Read,Grep,Glob,Skill,Agent' \
  --append-system-prompt "$system_prompt" \
  --settings '{"disableAllHooks":true}' \
  --no-session-persistence \
  --output-format json \
  --json-schema "$schema_json" \
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

if not isinstance(data, dict):
    sys.stderr.write("run-claude-review: claude output was not a JSON object\n")
    sys.exit(1)

result = data.get("result")
is_error = data.get("is_error", False)
structured = data.get("structured_output")

if isinstance(result, str) and result.strip() == "Unknown command: /code-review":
    sys.stderr.write("run-claude-review: /code-review is unavailable in this session\n")
    sys.exit(2)

if is_error:
    sys.stderr.write(f"run-claude-review: review did not complete cleanly (is_error={is_error})\n")
    sys.stderr.write(json.dumps(data, indent=2)[-4000:])
    sys.exit(1)

if not isinstance(structured, dict) or structured.get("review_complete") is not True:
    sys.stderr.write("run-claude-review: review did not provide explicit completion evidence\n")
    if isinstance(structured, dict) and isinstance(structured.get("report"), str):
        sys.stderr.write(structured["report"].rstrip()[-4000:] + "\n")
    elif isinstance(result, str):
        sys.stderr.write(result.rstrip()[-4000:] + "\n")
    sys.exit(1)

report = structured.get("report")
if not isinstance(report, str) or not report.strip():
    sys.stderr.write("run-claude-review: review completed without a final report\n")
    sys.exit(1)

report = report.strip()
sys.stdout.write(report)
if not report.endswith("\n"):
    sys.stdout.write("\n")
PYEOF
