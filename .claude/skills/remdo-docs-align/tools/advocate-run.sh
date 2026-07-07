#!/usr/bin/env sh
# Run the deletion-advocate prompt over {RULES_DOC}+{SCOPE}; write the numbered
# proposal artifact.
# Usage: advocate-run.sh <rules-doc> <scope> <output-file>
#   <rules-doc>   value substituted for {RULES_DOC} (e.g. docs/documentation.md)
#   <scope>       value substituted for {SCOPE} (the files or diff under review)
#   <output-file> where the FULL codex output is captured (caller-named)
#
# Substitutes the two placeholders in
# ../references/advocate.md (sibling of this script inside the skill), then runs
# `codex exec --sandbox read-only` from the repo root (a git cwd — codex's trust
# check needs one) with the prompt on stdin. Captures the complete output (no
# truncation) to <output-file>. Retries once when the first run fails, writes
# nothing, or produces an artifact with no numbered proposal (codex startup
# timeouts / transient failures / a session that dies mid-read leaving a
# proposal-less trace). The model's judgment stays opaque; only the invocation
# is scripted.
#
# Artifact validation and repair (both applied after capture, before success):
#   - De-dup: codex streams its final numbered answer, then reprints it verbatim
#     after a "tokens used\n<count>" marker. When the numbered-list block after
#     the marker byte-matches the equal-length block before it, the trailing copy
#     (marker line, count line, and repeat) is dropped so the artifact carries the
#     proposal list exactly once. A non-matching tail is left untouched.
#   - Non-empty proposals: the artifact must contain at least one numbered
#     proposal, detected by a "Replacement:" line. An artifact with none is a
#     failed run (e.g. codex died mid-read), so it triggers the retry and, if the
#     retry is also proposal-less, a non-zero exit.
# Fails loud (non-zero + stderr) on missing or extra args, a missing template,
# or a second empty/failed/proposal-less run.
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
# Refuse extra args: a fourth argument means the caller mis-shaped the call
# (e.g. an unquoted multi-word scope split into words), and silently dropping it
# would run the advocate over a truncated scope.
[ "$#" -eq 3 ] || fail "expected exactly 3 arguments, got $# (usage: advocate-run.sh <rules-doc> <scope> <output-file>)"

# The template is a sibling of this script inside the skill (references/);
# resolve from the script's location, not $PWD.
skill_dir=$(CDPATH='' cd -- "$(dirname -- "$0")/.." && pwd)
template="$skill_dir/references/advocate.md"
# Repo root (three levels above the skill dir): codex's trust check needs a
# git working dir; derive from the script location so worktree checkouts run
# codex in their own tree regardless of caller $PWD.
repo_root=$(CDPATH='' cd -- "$skill_dir/../../.." && pwd)
[ -f "$template" ] || fail "advocate template not found at $template"

# Build the prompt: take the template body after the '---' separator (the header
# above it is authoring notes, not part of the prompt), then substitute the two
# placeholders literally. gsub's replacement string gives `&` a "matched text"
# meaning, so a value containing `&` (e.g. a scope with "A & B") would corrupt —
# splice with index()/substr() instead, treating both the search and the
# replacement as plain text.
prompt=$(
  awk 'seen { print } /^---[[:space:]]*$/ { seen = 1 }' "$template" \
    | awk -v r="$rules_doc" -v s="$scope" '
        function splice(line, needle, value,   out, pos) {
          out = ""
          while ((pos = index(line, needle)) > 0) {
            out = out substr(line, 1, pos - 1) value
            line = substr(line, pos + length(needle))
          }
          return out line
        }
        {
          $0 = splice($0, "{RULES_DOC}", r)
          $0 = splice($0, "{SCOPE}", s)
          print
        }
      '
)
[ -n "$prompt" ] || fail "empty prompt after substitution — template may be malformed"

run_codex() {
  # Full output (stdout+stderr) to the file, no truncation. Runs from repo root.
  ( cd -- "$repo_root" && printf '%s\n' "$prompt" | codex exec --sandbox read-only - ) \
    >"$out" 2>&1
}

# De-dup the doubled final answer in place. codex reprints its numbered proposal
# list verbatim after a "tokens used\n<count>" marker; when the block after the
# marker byte-matches the equal-length block ending just before it, the trailing
# copy is redundant and dropped. A tail that does not match (e.g. genuinely
# different trailing text) is left as-is.
dedup_artifact() {
  awk '
    { lines[NR] = $0 }
    /^tokens used$/ { marker = NR }
    END {
      total = NR
      # No marker, or nothing after the count line: emit unchanged.
      if (marker == 0 || marker + 2 > total) { for (i = 1; i <= total; i++) print lines[i]; exit }
      tail_start = marker + 2          # skip "tokens used" and its count line
      tail_len = total - tail_start + 1
      pre_start = marker - tail_len    # equal-length slice ending at marker-1
      dup = (pre_start >= 1)
      for (i = 0; dup && i < tail_len; i++)
        if (lines[pre_start + i] != lines[tail_start + i]) dup = 0
      if (dup) for (i = 1; i <= marker - 1; i++) print lines[i]
      else     for (i = 1; i <= total; i++) print lines[i]
    }
  ' "$out" >"$out.dedup" && mv -- "$out.dedup" "$out"
}

# A valid artifact carries at least one numbered proposal, each of which has a
# "Replacement:" line — a proposal-less trace is a failed run (codex died
# mid-read), not an empty-but-fine result.
has_proposal() {
  [ -s "$out" ] && grep -q 'Replacement:' "$out"
}

# One attempt: capture, de-dup, then require a non-empty proposal list.
attempt() {
  run_codex || return 1
  dedup_artifact
  has_proposal
}

# First attempt; retry once on failure, an empty artifact, or no proposals.
if attempt; then
  echo "ADVOCATE=ok"
  echo "OUTPUT=$out"
  exit 0
fi

if attempt; then
  echo "ADVOCATE=ok"
  echo "OUTPUT=$out"
  echo "RETRIED=1"
  exit 0
fi

fail "codex advocate run failed or produced no numbered proposals after one retry — see $out"
