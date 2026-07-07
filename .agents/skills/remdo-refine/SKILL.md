---
name: remdo-refine
description: Use to run the autonomous quality loop over a diff on the current branch — simplify, review at max effort, then external Codex review, looping until a clean pass. Works on either a committed range (default `origin/main...HEAD`, or an explicit range, clean tree) or the uncommitted working tree (opt-in, for reviewing changes before committing, such as a feature-flow spec). Triggers include "refine this", "run the refine ladder", "review/simplify/fix loop", "refine the uncommitted changes", or `remdo-feature-flow` calling it.
---

# Refine

## Overview

Drive a diff to a clean quality bar through a fixed **ladder** of review passes,
looping until a full pass finds nothing more worth fixing. Fixes settle the rung
that found them, and a final confirmation cycle re-runs the whole ladder, so
every pass ends having reviewed the finished code.

It improves **code quality**, not feature scope — it converges the code, not the
spec. When `remdo-feature-flow` calls it, reaching the spec's described state
stays that skill's gap-closing loop; refine polishes what that loop produced.

Per the **Skill authoring** rule in `AGENTS.md`, this skill encodes *intent* and
fixes a step only where the path is clear (the ladder order, the
settle-then-confirm loop);
where it does not, it states the intent and trusts the run — hence the loop guard
below is a judgement, not a tuned number.

## Scope

Refine works on a single diff, fixed at invocation. There are two scopes; pick
exactly one and keep it for every pass.

**Resolve the scope by running `sh .agents/skills/remdo-refine/tools/resolve-scope.sh [scope]`** (its
header states the full contract). Pass no argument for the committed-range default
(this branch's own work), or `working-tree` to review the uncommitted changes
before they enter history. It prints `SCOPE=`/`BASE=` plus the file list. The
judgment around it stays here:

- **Refusal handling.** A non-zero exit means the requested scope is unresolvable
  — most often the mixed-scope refusal (committed range over a dirty tree). Warn
  and stop until the work is committed or stashed. Do not fold the uncommitted
  changes in to make it resolve.
- **Integration-branch confirmation.** The script's committed-range default
  (`origin/main...HEAD`) is meaningless on an integration branch (`dev`) or any
  branch where that range is not one unit of work — it would sweep in every commit
  `dev` gathered since it forked from `main`, and refine *commits* fixes across all
  of it. There, **do not accept the default: confirm an explicit range first.**
  The conversation usually makes it obvious (the work just done, the last commit,
  the last few) — state the concrete range you'll pass to the script and proceed
  once confirmed.

The two scopes differ in what the loop does with the resolved diff:

### Committed-range scope (default)

The diff is `<base-sha>..HEAD` with the base anchored to the immutable SHA the
script pinned. The loop commits fixes, so `HEAD` advances every cycle; reviewing
against the pinned SHA (not a re-evaluated relative ref) keeps each fix inside the
range for the next pass and never shifts the base forward under the loop.

**The working tree must be clean** in this scope — the script's mixed-scope
refusal enforces it, since staged/unstaged/untracked changes would sit outside the
range and go silently unreviewed. So that each cycle reviews the previous one's
result, **commit every applied fix** before re-running any pass — the fix then
lands inside the resolved range and the tree stays clean for the next pass.

### Working-tree scope (opt-in)

The diff is the **uncommitted changes** (staged + unstaged + untracked), and the
working tree *is* the artifact — fixes are applied **in place, not committed**.
Use it to refine changes the user wants to review *before* they enter history —
most naturally a `remdo-feature-flow` spec at its Phase-3 gate, where the point
is to vet the uncommitted docs before approval. Enter it only when the caller
asks for it (e.g. "refine the uncommitted changes" / "refine before I commit");
it is never the silent default.

Here the script's gate is the mirror image: an **empty** tree is the refusal
(nothing to refine). Each pass re-reads the working tree rather than a committed
range, so re-runs still review the post-fix state; the "commit every fix" rule
does **not** apply — the user commits once, after their own review. Everything
else (ladder order, triage, done/stuck) is identical to the committed-range
scope.

## The ladder

Refine is the **sole caller** of these rungs; nothing else invokes them as a
loop. They run cheapest and most local first, most independent last. Each is a
**read-only finder** over the same diff under review (the resolved range, or the
working-tree changes): a rung reports, and the coordinating session triages,
applies what is approved, and owns the loop. Keeping finding and applying apart
is what makes triage a real gate — a rung that edited the tree would pre-empt it.

**Exception — the docs-align rung edits.** Rung 2 (`remdo-docs-align`) is the one
editing rung: by its own contract it applies edits (it self-commits only when run
standalone — as this rung it commits nothing, and refine's loop owns the commits,
see its **Permissions**). Its *applied dispositions* are therefore triaged
**post-hoc** — the coordinating session reviews what it changed rather than gating
each edit beforehand, then commits them like any other approved fix in
committed-range scope — and its **ESCALATE** rows are treated like any other
rung's findings.

Every rung must review with **fresh eyes** — the coordinating session's memory
of implementing and reviewing the diff would bias it toward parts it thinks it
cleaned. Run the simplify and internal-review rungs in the current agent's
fresh-context mechanism (for example, a Claude Code fork/explore context or a
Codex fresh subagent). Run the external rung through a separate configured
reviewer or process so it does not inherit the coordinating session's context.

1. **Simplify** — invoke the **`remdo-simplify`** skill:
   - **Objective:** find where the diff's end state could be shorter or simpler.
   - **Scope passed:** a **literal resolver argument** the rung re-resolves for
     itself — `<base-sha>..HEAD` for a committed range or `working-tree` for the
     uncommitted scope, never a bare SHA (which the rung cannot tell from a ref
     and would mis-resolve). Nothing else (no suspected fixes, no implementation
     context, which would defeat the fresh read).
   - **Report back:** its finding list (code/test lenses and the pass-in-passing
     doc-invariant check are defined there, not here).
   - **Triage:** treat each finding under the loop's triage rules below.

2. **Docs align** — for any diff touching `docs/**` or skill prose, invoke the
   **`remdo-docs-align`** skill (a sibling rung to simplify, not nested inside
   it); skip it for a diff with no such files.
   - **Objective:** converge the touched doc/skill prose to its rules doc.
   - **Scope passed:** the doc/skill files within the resolved scope; docs-align
     decides which of its own stages that scope needs.
   - **Report back:** its per-proposal disposition list plus any ESCALATE table.
   - **Triage:** consume the dispositions like any findings; surface an ESCALATE
     row as a tradeoff or blocker per the loop rules.

3. **Internal review** — invoke the current agent's strongest internal review
   surface at max effort:
   - **Objective:** an internal correctness/quality read of the diff.
   - **Scope passed:** the diff under review (the resolved range's base, or the
     working-tree changes).
   - **Agent adapter:** Claude Code uses `/code-review`; Codex uses a fresh
     review subagent or its closest review-mode equivalent. If the runtime lacks
     an isolated review surface, stop and report the missing dependency rather
     than reviewing in the coordinating context.
   - **Report back / triage:** its findings, triaged under the loop rules.

4. **External review** — invoke the configured external reviewer for an
   independent outside read:
   - **Objective:** a fresh external read from a separate process.
   - **Scope passed:** committed-range scope uses the anchored base SHA; working
     tree scope uses the reviewer's uncommitted/working-tree mode. Give it
     **scope only, no review angle** — leading prompt framing defeats the point.
   - **Agent adapter:** Claude Code's default external reviewer is `codex review`
     with `--base <anchored-base-sha>` or `--uncommitted` as appropriate. Pass
     the base SHA the resolver pinned, **not** `--base origin/main` — codex
     recomputes its own merge-base from the ref, so a bare `origin/main` would
     drift if it advances mid-loop (`--base` accepts a commit SHA, not only a
     branch). Codex should use the configured non-coordinating review surface for
     the run; if none is available, stop and report the missing dependency rather
     than silently dropping the rung.
   - **Report back / triage:** its findings, triaged under the loop rules.

Forward the `AGENTS.md` findings-suppression rule to every rung and subagent.

## The loop

Each rung produces findings. Triage, apply what is approved (committing it in
committed-range scope; in place in working-tree scope), then **re-run that same
rung** until it settles (returns nothing more to apply), and move down the
ladder. Mid-loop fixes do not restart the ladder — the confirmation cycle below
is where earlier rungs re-see the finished code, so a late nit no longer re-buys
every earlier, more expensive rung on each iteration.

- **Approved fix** — clearly correct and safe (or an intended change the diff owns).
  Apply it (committed-range: commit; working-tree: leave in the tree); the run is
  not done.
- **Tradeoff** — a real choice with no single correct answer. Solve it best-effort
  and **record it in `docs/todo.md`** — a tradeoff is a deferral until a final
  decision is deliberately taken, so the entry persists until then (don't leave it
  only chat-remembered). Never blocks; the end report points at the entry.
- **Reject** — not a real issue, or out of scope. Drop it.

Once every rung has settled, run a **confirmation cycle**: the full ladder again
from rung 1, against the finished diff. **Done** when a confirmation cycle
produces zero approved fixes; if it produces any, settle the rung that raised
them as above, then confirm again. **Stuck** (stop and
report) when a finding recurs with no progress, or the diff will not converge
after a few cycles. **Blocker** — only a finding with no clear recommendation;
anything with a defensible best-effort resolution is a tradeoff, not a blocker.

## Verification

When the loop settles, run the checks plus **`pnpm run audit:cleanup`** — the
deterministic backstop for the simplify rung (ast-grep anti-patterns, `knip`
dead code, `jscpd` duplication), which the check scripts don't cover and only
CI otherwise catches. Which check script: **committed-range scope always needs
`pnpm run check:full`** — the loop's fixes are committed, so the changed-only
`check` would select no tests. In **working-tree scope** the fixes are
uncommitted, so the current agent mode's script applies (`AGENTS.md` "Checks");
a docs- or skill-only diff may also skip `audit:cleanup`, which exercises
nothing it touched.

A failure caused by an applied fix re-enters the loop; a pre-existing
unrelated failure is reported, not fixed here.

## Permissions

In **committed-range** scope refine commits each fix, so invoking it is an
explicitly declared autonomous scope (per AGENTS.md): authorization to commit
**on the current branch** — never push. **`main` stays protected**:
if invoked on `main`, warn and stop (same guard as the dirty-tree check) rather
than self-committing there. Inside a `remdo-feature-flow` run, that skill's commit
policy already governs.

In **working-tree** scope refine commits nothing — its boundary is *no commit*,
not *no clean files*. Applying a finding may require editing a clean companion
file (e.g. fixing an inbound link in a clean doc, or adding a
test for an uncommitted code change); that is fine, since editing uncommitted-by-
the-end files is the global default anyway. It carries no commit authorization
and the `main` guard does not apply (it never writes history). The user owns the
eventual commit.

## Final report

Index the result, do not re-narrate it: scope and base; cycle count and why the
loop ended; fixes applied (pointing at files, not prose, noting where in the
diff each finding sat); tradeoffs taken with a pointer to their
`docs/todo.md` entries; any blocker with its gathered data; and the final checks
with pass/fail.

Then one **per-rung counts** line each for simplify / docs-align / internal /
external: how many times it ran, findings it surfaced, and how many of those were
applied (docs-align only when the diff touched doc/skill prose).

## References

- Ladder rungs invoked in order: `remdo-simplify` skill, `remdo-docs-align` skill
  (doc-touching diffs), current-agent internal review, external review.
- Scope resolution mechanics: `.agents/skills/remdo-refine/tools/resolve-scope.sh`.
- Branch base and the `origin/main...HEAD` diff contract:
  `docs/contributing.md#git-workflow`.
- Bringing `origin/main` into the branch: `remdo-sync` skill.
- Skill-authoring rule, findings-suppression, and checks: `AGENTS.md`.
