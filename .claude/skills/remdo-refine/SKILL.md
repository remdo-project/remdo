---
name: remdo-refine
description: Use to run the autonomous quality loop over a diff on the current branch — simplify, review at max effort, then external Codex review, looping until a clean pass. Works on either a committed range (default `origin/main...HEAD`, or an explicit range, clean tree) or the uncommitted working tree (opt-in, for reviewing changes before committing, such as a feature-flow spec). Triggers include "refine this", "run the refine ladder", "review/simplify/fix loop", "refine the uncommitted changes", or `remdo-feature-flow` calling it.
---

# Refine

## Overview

Drive a diff to a clean quality bar through a fixed **ladder** of review passes,
looping until a full pass finds nothing more worth fixing. Each approved fix
restarts the ladder from the top, so later, more expensive passes always run
against already-cleaned code.

It improves **code quality**, not feature scope — it converges the code, not the
spec. When `remdo-feature-flow` calls it, reaching the spec's described state
stays that skill's gap-closing loop; refine polishes what that loop produced.

Per the **Skill authoring** rule in `AGENTS.md`, this skill encodes *intent* and
fixes a step only where the path is clear (the ladder order, the restart rule);
where it does not, it states the intent and trusts the run — hence the loop guard
below is a judgement, not a tuned number.

## Scope

Refine works on a single diff, fixed at invocation. There are two scopes; pick
exactly one and keep it for every pass — never review a mix of committed and
uncommitted changes in one run, which would make the diff under review ambiguous.

### Committed-range scope (default)

The diff is `<base-sha>..HEAD`. Resolved once, deterministically, in this order:

1. An **explicit range/base passed at invocation** wins (e.g. the caller says
   "refine `HEAD~3..HEAD`" or "refine the commit we just made"). Honour it; do
   not second-guess the intent.
2. Otherwise, **on a task branch forked from `origin/main`**, default to
   **`origin/main...HEAD`** (see `remdo-feature-flow` "Branch base") — the
   three-dot merge-base range that is exactly that branch's own work, needing no
   stored base.
3. **On an integration branch** (`dev`) or any branch where `origin/main...HEAD`
   is not one unit of work — many accumulated merges, or no merge-base at all —
   this default is meaningless (it would sweep in every commit `dev` gathered
   since it forked from `main`, and refine *commits* fixes across all of it). So
   **do not default; ask for an explicit range**. The conversation usually makes
   the intended range obvious (the work just done, the last commit, the last few)
   — state the concrete range you'll use and proceed once it's confirmed. Refine
   runs on `dev` per Permissions, but always against a range the caller pins here,
   never the branch-wide default.

Refine never silently infers the range from session context: it is given one, or
(case 3) it confirms one before proceeding.

**Anchor the base to a fixed commit SHA, not a relative ref.** The loop commits
fixes, so `HEAD` advances every cycle. Resolve the range's base **once** to an
immutable SHA and review `<base-sha>..HEAD` on every pass — never re-evaluate a
range whose base can move per cycle, which would shift the base forward and
silently drop already-reviewed work. This applies to the `origin/main...HEAD`
default too: resolve it once with `git merge-base origin/main HEAD` at invocation
and reuse that SHA, so an `origin/main` that advances mid-loop (or a HEAD-relative
base like `HEAD~3`) can't move the base under the loop. Anchoring the base and
letting only `HEAD` move keeps each fix inside the range for the next pass, as the
loop requires.

**The working tree must be clean** in this scope. Staged, unstaged, or untracked
changes sit outside the resolved range and would be silently unreviewed, so if
the tree is dirty, **warn and stop** until the work is committed (or stashed).
This is why `remdo-feature-flow` commits its phase-4 work before invoking refine.

So that each cycle reviews the previous one's result, **commit every applied
fix** before re-running the ladder — the fix then lands inside the resolved range
and the tree stays clean for the next pass.

### Working-tree scope (opt-in)

The diff is the **uncommitted changes** (staged + unstaged + untracked), and the
working tree *is* the artifact — fixes are applied **in place, not committed**.
Use it to refine changes the user wants to review *before* they enter history —
most naturally a `remdo-feature-flow` spec at its Phase-3 gate, where the point
is to vet the uncommitted docs before approval. Enter it only when the caller
asks for it (e.g. "refine the uncommitted changes" / "refine before I commit");
it is never the silent default.

In this scope the clean-tree gate is inverted: an **empty** working-tree diff is
the stop condition (nothing to refine), and a dirty tree is expected. The
loop-restart property is preserved by re-reading the working tree each cycle
rather than a committed range; the "commit every fix" rule does **not** apply —
the user commits once, after their own review. Everything else (ladder order,
triage, done/stuck) is identical to the committed-range scope.

## The ladder

Three passes, cheapest and most local first, most independent last. Each reviews
the same diff under review (the resolved range, or the working-tree changes).

**Run each in-session review pass (1 and 2) as a fresh, context-limited
subagent** given only the scope — the coordinating session's memory of
implementing and reviewing the diff would bias it toward parts it thinks it
cleaned. Pass 3 (codex, a separate process) gets this fresh read for free. The
coordinating session triages the returned findings and owns the loop.

1. **Simplify** — `/simplify`, plus a **doc-minimalism lens** for prose
   (`docs/**`, skill files): read each touched doc/skill *whole* in load order
   (entry doc → its dependencies → the file), and for each paragraph ask whether
   it earns its place — is it **new** (not already stated upstream), **necessary**
   (the reader's next action fails without it), and **single-sourced** (this is
   its home)? Cut or relocate what fails; allow a one-line cite of a shared rule
   where self-containment matters (not a full restatement). Reading the whole
   touched file, not just the diff hunk, is what catches redundancy against
   unchanged upstream text. Also check each touched doc against the
   **documentation invariants** (`docs/contributing.md#documentation`) and fix
   any violation.
2. **Internal review** — `/code-review` at max effort against the diff under
   review (the resolved range's base, or the working-tree changes).
3. **External review** — `codex review` for an independent outside read:
   `--base <anchored-base-sha>` in committed-range scope, `--uncommitted` in
   working-tree scope. Pass the base SHA resolved above, **not** `--base
   origin/main` — codex recomputes its own merge-base from the ref, so a bare
   `origin/main` would drift if it advances mid-loop, the same drift the
   SHA-anchoring rule prevents (`--base` accepts a commit SHA, not only a branch).
   Give it **scope only, no review angle** — leading prompt framing defeats the
   point.

Forward the `AGENTS.md` findings-suppression rule to every pass and subagent.

## The loop

Each pass produces findings. Triage, apply what is approved (committing it in
committed-range scope; in place in working-tree scope), then **restart from pass
1** — a simplify or internal pass should always see the post-fix code first.

- **Approved fix** — clearly correct and safe (or an intended change the diff owns).
  Apply it (committed-range: commit; working-tree: leave in the tree); the run is
  not done.
- **Tradeoff** — a real choice with no single correct answer. Solve it best-effort
  and **record it in `docs/todo.md`** — a tradeoff is a deferral until a final
  decision is deliberately taken, so the entry persists until then (don't leave it
  only chat-remembered). Never blocks; the end report points at the entry.
- **Reject** — not a real issue, or out of scope. Drop it.

**Done** when a full cycle produces zero approved fixes. **Stuck** (stop and
report) when a finding recurs with no progress, or the diff will not converge
after a few cycles. **Blocker** — only a finding with no clear recommendation;
anything with a defensible best-effort resolution is a tradeoff, not a blocker.

## Verification

When the loop settles, run the final checks for the **current agent mode**
(`AGENTS.md` "Checks" — local-agent or cloud, e.g. cloud requires the `:full`
suites), plus **`pnpm run audit:cleanup`** — the deterministic backstop for the
simplify rung (ast-grep anti-patterns, `knip` dead code, `jscpd` duplication),
which local-agent checks otherwise skip and only CI catches. A failure caused by
an applied fix re-enters the loop; a pre-existing unrelated failure is reported,
not fixed here.

`pnpm run lint` is always mandatory (it is fast and `AGENTS.md` requires it
before handing any task back). What may be narrowed is the heavier work: in
**local-agent** runs a docs- or skill-only diff (common in working-tree scope,
e.g. a feature-flow spec) can skip the code test suites and `audit:cleanup`,
since they exercise nothing the diff touched. **Cloud-agent** runs narrow
nothing — `AGENTS.md` requires `lint` + `test:unit:full` + `test:collab:full` in
full regardless of diff content unless the user explicitly skips one.

## Permissions

In **committed-range** scope refine commits each fix, so invoking it is an
explicitly declared autonomous scope (per AGENTS.md): authorization to commit
**on the current branch** — never push. The dropped task-branch restriction lets
it run on `dev` as readily as a feature branch, but **`main` stays protected**:
if invoked on `main`, warn and stop (same guard as the dirty-tree check) rather
than self-committing there. Inside a `remdo-feature-flow` run, that skill's commit
policy already governs.

In **working-tree** scope refine commits nothing — its boundary is *no commit*,
not *no clean files*. Applying a finding may require editing a clean companion
file (e.g. updating `docs/index.md` for a new uncommitted spec page, or adding a
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

Then one **per-rung counts** line each for simplify / internal / external: how
many times it ran, findings it surfaced, and findings applied.

## References

- Sequenced tools: `/simplify`, `/code-review`, `codex review`.
- Loop/loop-guard prior art: `remdo-deps-refresh` skill.
- Branch base and the calling flow: `remdo-feature-flow` skill.
- Bringing `origin/main` into the branch: `remdo-sync` skill.
- Skill-authoring rule, findings-suppression, and checks: `AGENTS.md`.
