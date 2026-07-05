#!/usr/bin/env sh
# Run the deletion-advocate prompt over {RULES_DOC}+{SCOPE}; write the numbered
# proposal artifact.
# Usage: advocate-run.sh <rules-doc> <scope> <output-file>
#   <rules-doc>   value substituted for {RULES_DOC} (e.g. docs/documentation.md)
#   <scope>       value substituted for {SCOPE} (the files or diff under review)
#   <output-file> where the FULL codex output is captured (caller-named)
#
# Substitutes the two placeholders in
# .claude/skills/remdo-docs-align/references/advocate.md, then runs
# `codex exec --sandbox read-only` from the repo root (a git cwd — codex's trust
# check needs one) with the prompt on stdin. Captures the complete output (no
# truncation) to <output-file>. Retries once when the first run fails or writes
# nothing (codex startup timeouts / transient failures). The model's judgment
# stays opaque; only the invocation is scripted.
# Fails loud (non-zero + stderr) on missing args, a missing template, or a
# second empty/failed run.
set -eu

fail() {
  echo "advocate-run: $1" >&2
  exit 1
}

rules_doc=${1-}
scope=${2-}
out=${3-}
[ -n "$rules_doc" ] || fail "missing rules doc (usage: advocate-run.sh <rules-doc> <scope> <output-file>)"
[ -n "$scope" ] || fail "missing scope (usage: advocate-run.sh <rules-doc> <scope> <output-file>)"
[ -n "$out" ] || fail "missing output file (usage: advocate-run.sh <rules-doc> <scope> <output-file>)"

# Repo root: codex's trust check needs a git working dir, and the template path
# is repo-relative. Derive it from this script's location, not $PWD.
repo_root=$(CDPATH='' cd -- "$(dirname -- "$0")/../.." && pwd)
template="$repo_root/.claude/skills/remdo-docs-align/references/advocate.md"
[ -f "$template" ] || fail "advocate template not found at $template"

# Build the prompt: take the template body after the '---' separator (the header
# above it is authoring notes, not part of the prompt), then substitute the two
# placeholders literally. The braces in the patterns are escaped so awk reads
# them as literal text; the values are a skill-supplied rules-doc path and scope
# descriptor, so no substitution metacharacters arise in practice.
prompt=$(
  awk 'seen { print } /^---[[:space:]]*$/ { seen = 1 }' "$template" \
    | awk -v r="$rules_doc" -v s="$scope" '
        { gsub(/\{RULES_DOC\}/, r); gsub(/\{SCOPE\}/, s); print }
      '
)
[ -n "$prompt" ] || fail "empty prompt after substitution — template may be malformed"

run_codex() {
  # Full output (stdout+stderr) to the file, no truncation. Runs from repo root.
  ( cd -- "$repo_root" && printf '%s\n' "$prompt" | codex exec --sandbox read-only - ) \
    >"$out" 2>&1
}

# First attempt; retry once on non-zero exit or an empty artifact.
if run_codex && [ -s "$out" ]; then
  echo "ADVOCATE=ok"
  echo "OUTPUT=$out"
  exit 0
fi

if run_codex && [ -s "$out" ]; then
  echo "ADVOCATE=ok"
  echo "OUTPUT=$out"
  echo "RETRIED=1"
  exit 0
fi

fail "codex advocate run failed or produced no output after one retry — see $out"
