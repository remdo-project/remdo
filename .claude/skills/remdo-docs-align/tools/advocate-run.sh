#!/usr/bin/env sh
# Run the deletion-advocate prompt over {RULES_DOC}+{SCOPE}; write the numbered
# proposal artifact.
# Usage: advocate-run.sh <rules-doc> <scope> <output-file>
#   <rules-doc>   value substituted for {RULES_DOC} (e.g. docs/documentation.md)
#   <scope>       value substituted for {SCOPE} (the files or diff under review)
#   <output-file> where the canonical proposal table is written (caller-named)
#
# Substitutes the two placeholders in
# ../references/advocate.md (sibling of this script inside the skill), then runs
# `codex exec --sandbox read-only` from the repo root (a git cwd — codex's trust
# check needs one) with the prompt on stdin. Retries once when the first run
# fails, writes nothing, or produces an artifact with no valid proposal (codex
# startup timeouts / transient failures / a session that dies mid-read leaving a
# proposal-less trace). The model's judgment stays opaque; only the invocation
# is scripted.
#
# Output contract (three files, all caller-relative):
#   - <output-file>       the canonical numbered proposal table (or the
#                         NO PROPOSALS sentinel), ready for stage-4 adjudication.
#   - <output-file>.msg   codex's final agent message only (its clean channel,
#                         captured via `--output-last-message`); the source the
#                         table is normalized from.
#   - <output-file>.raw   the full mixed codex stream (stdout+stderr), untruncated,
#                         for provenance.
# Validity: the normalized table carries either at least one proposal block with
# BOTH a `Text:` and a `Replacement:` line, or the explicit `NO PROPOSALS`
# sentinel the prompt asks for on a minimal scope. Sentinel precedence: the
# sentinel counts only when extraction yields zero Text-anchored blocks; if both
# appear, the blocks win and a warning is printed to stderr. An artifact with
# neither is a failed run (e.g. codex died mid-read), so it triggers the retry
# and, if the retry also has neither, a non-zero exit. A NO-PROPOSALS result
# emits ADVOCATE=ok with PROPOSALS=none so the caller skips adjudication cleanly.
#
# Fails loud (non-zero + stderr) on missing or extra args, a missing template,
# an uncreatable output directory, a codex exit that leaves the final-message
# file missing/empty, or a second run with neither proposals nor the sentinel.
set -eu

# Single source for the canonical block-head prefix: the normalizer writes it
# and has_proposal greps for it, so they can never drift.
HEAD_PREFIX='file: '

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

# Ensure the output file's parent exists, so the capture redirect below can't
# fail on a fresh checkout/worktree (e.g. a not-yet-created .agent/tmp/) and be
# misreported as an advocate failure. The redirect uses $out as given (relative
# to the caller's cwd), so resolve the parent the same way.
out_dir=$(dirname -- "$out")
mkdir -p -- "$out_dir" || fail "cannot create output directory '$out_dir'"

run_codex() {
  # codex's clean channel: --output-last-message writes ONLY the final agent
  # message to "$out.msg" (no reading trace, no reprint), which the normalizer
  # reads. The full mixed stream (stdout+stderr) goes to "$out.raw" for
  # provenance — this is the genuinely full capture. Runs from repo root.
  # Clear any previous run's final message first: a stale "$out.msg" would
  # otherwise pass the size check below when codex exits 0 without writing one,
  # silently normalizing the old table.
  rm -f -- "$out.msg"
  ( cd -- "$repo_root" \
      && printf '%s\n' "$prompt" \
      | codex exec --sandbox read-only -o "$out.msg" - ) \
    >"$out.raw" 2>&1 || return 1
  # A clean exit that left no final message means codex produced nothing usable
  # (died before its final turn); treat it as a failed attempt, not an empty-ok.
  [ -s "$out.msg" ] || return 1
}

# Normalize codex's final message into the canonical stage-4 table: one block
# per proposal, renumbered sequentially, single-line label values. A block is
# anchored on a `Text:` (or legacy `Quote:`) line; the nearest preceding
# non-empty line is its location (leading numbering, backticks, and a `file:`
# prefix are stripped). A stray location line (a `N. …`/`N) …` line with no
# following label) also opens a block, so a missing-`Text:` proposal is
# head-minted rather than silently vanishing. Only the known labels survive; the
# reading trace and prompt echo are dropped. Observed drifts this absorbs:
# unnumbered label blocks, Quote:/Text: label swap, wrapped label values.
#
# Sentinel precedence: the awk emits BLOCKS=<n> on the last line so the caller
# can tell a genuine sentinel (zero blocks) from a sentinel line that appeared
# alongside real proposals (blocks win; warn).
normalize_artifact() {
  awk -v head="$HEAD_PREFIX" '
    function flushlabel() { if (label != "") { print label ": " val; label = ""; val = "" } }
    function startblock(loc) {
      flushlabel()
      n++
      sub(/^[[:space:]]*[0-9]+[.)][[:space:]]*/, "", loc)
      gsub(/`/, "", loc)
      sub(/^file:[[:space:]]*/, "", loc)
      if (n > 1) print ""
      print n ". " head loc
    }
    # A location-shaped line ("N. …" / "N) …") flushes any open label and, when
    # no Text: has minted a block for it yet, mints one from the location so a
    # truncated (missing-Text) proposal is not dropped. prev still holds it for a
    # following Text: line, which starts a fresh block for the real quote.
    /^[[:space:]]*[0-9]+[.)][[:space:]]/ {
      flushlabel()
      if (pending_loc != "") { startblock(pending_loc) }
      pending_loc = $0
      prev = $0
      next
    }
    /^(Text|Quote):/ {
      # Mint only from a location-shaped line (numbered, or a path-like token
      # with a slash / dot-extension). Arbitrary prose above the label must not
      # become a bogus "file:" row; with no valid location the block is not
      # minted, the labels fold nowhere, and validation fails the run loudly.
      if (pending_loc != "") {
        startblock(pending_loc)
      } else if (prev ~ /^[[:space:]]*[0-9]+[.)][[:space:]]/ || prev ~ /`?(file:[[:space:]]*)?[^ ]*[/.][^ ]*:?[0-9]*`?[[:space:]]*$/ && prev ~ /[/.]/ && prev !~ /[[:space:]].*[[:space:]].*[[:space:]]/) {
        startblock(prev)
      }
      pending_loc = ""
      if (n > 0) { label = "Text"; val = $0; sub(/^(Text|Quote):[[:space:]]*/, "", val) }
      prev = $0; next
    }
    /^(Replacement|Rule|Risk test|Borderline):/ {
      if (pending_loc != "") { startblock(pending_loc); pending_loc = "" }
      if (n > 0) {
        flushlabel()
        label = $0; sub(/:.*$/, "", label)
        val = $0; sub(/^[^:]*:[[:space:]]*/, "", val)
      }
      prev = $0; next
    }
    # Blank line: close the open label. A pending location stays pending — a
    # blank between a numbered location and its Text: is legitimate formatting;
    # minting here would emit an empty duplicate block. (A truncated label-less
    # proposal is minted when the NEXT location supersedes it, or at END.)
    # Do NOT reset prev.
    /^[[:space:]]*$/ {
      flushlabel()
      next
    }
    {
      if (label != "") val = val " " $0
      prev = $0
    }
    END {
      flushlabel()
      if (pending_loc != "") { startblock(pending_loc); flushlabel() }
      print "BLOCKS=" n > "/dev/stderr"
    }
  ' "$out.msg" 2>"$out.blocks" >"$out.norm" \
    && mv -- "$out.norm" "$out"
}

# Count the Text-anchored blocks the last normalize produced (its BLOCKS= line).
block_count() {
  sed -n 's/^BLOCKS=//p' "$out.blocks" 2>/dev/null | tail -1
}

# A valid proposal block carries BOTH a Text: and a Replacement: line. The table
# lists one head line ("N. file: …") per block; require at least one head whose
# block also holds Replacement:. Cheap structural check: at least one head line
# AND at least one Replacement: line (the normalizer only emits Replacement:
# inside a block).
has_proposal() {
  [ -s "$out" ] \
    && grep -qE "^[0-9]+\. $HEAD_PREFIX" "$out" \
    && grep -q '^Replacement:' "$out"
}
is_no_proposals() {
  [ -s "$out.msg" ] && grep -qx 'NO PROPOSALS' "$out.msg"
}

# One attempt: capture codex's clean channel, normalize, then require either a
# valid proposal block or the sentinel. Sentinel precedence: honor NO PROPOSALS
# only when zero blocks were extracted; if the sentinel appears alongside real
# blocks, prefer the blocks and warn.
attempt() {
  run_codex || return 1
  normalize_artifact
  blocks=$(block_count)
  if is_no_proposals; then
    if [ "${blocks:-0}" -gt 0 ]; then
      echo "advocate-run: NO PROPOSALS sentinel appeared alongside $blocks proposal block(s); preferring the blocks" >&2
      has_proposal
    else
      printf 'NO PROPOSALS\n' >"$out"
      return 0
    fi
  else
    has_proposal
  fi
}

# First attempt; retry once on failure, an empty artifact, or a trace carrying
# neither proposals nor the sentinel.
for n in 1 2; do
  if attempt; then
    rm -f -- "$out.blocks"
    echo "ADVOCATE=ok"
    echo "OUTPUT=$out"
    if grep -qx 'NO PROPOSALS' "$out"; then echo "PROPOSALS=none"; else echo "PROPOSALS=some"; fi
    [ "$n" -eq 2 ] && echo "RETRIED=1"
    exit 0
  fi
done

rm -f -- "$out.blocks"
fail "codex advocate run failed or produced neither proposals nor a NO PROPOSALS sentinel after one retry — see $out.raw"
