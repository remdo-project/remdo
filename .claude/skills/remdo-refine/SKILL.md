---
name: remdo-refine
description: Use to run the autonomous quality loop over a committed range on the current branch (defaults to `wip-base..HEAD`, accepts an explicit range, clean tree) — simplify, review at max effort, then external Codex review, looping until a clean pass. Triggers include "refine this", "run the refine ladder", "review/simplify/fix loop", or `remdo-feature-flow` calling it after implementation. Commit your work first; it does not review uncommitted changes.
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

Refine works on a single committed range, fixed at invocation — one base, one
scope, every pass, no committed-vs-uncommitted branching. The range is resolved
once, deterministically, in this order:

1. An **explicit range/base passed at invocation** wins (e.g. the caller says
   "refine `HEAD~3..HEAD`" or "refine the commit we just made"). Use it verbatim;
   do not second-guess it.
2. Otherwise default to **`wip-base..HEAD`** (see `remdo-feature-flow` "Branch
   base") — the natural scope on a task branch, where `remdo-sync` keeps
   `wip-base` correct.
3. If `wip-base` is absent or stale for the current branch (typically on `dev`,
   which is not a task branch), there is no meaningful default: **ask for an
   explicit range rather than guessing**. The conversation usually makes the
   intended range obvious (the work just done, the last commit, the last few) —
   state the concrete range you'll use and proceed once it's confirmed.

Refine itself does not infer scope from session context; the caller resolves the
range and passes it in. Keeping `wip-base` correct is `remdo-sync`'s job, not
refine's.

If `origin/main` has advanced past `wip-base` (a cheap `git fetch` check), emit a
**non-blocking** nudge — "origin/main is newer; consider `remdo-sync`" — and
continue; a stale base does not stop a refine run.

**The working tree must be clean.** Staged, unstaged, or untracked changes sit
outside `wip-base..HEAD` and would be silently unreviewed, so if the tree is dirty,
**warn and stop** until the work is committed (or stashed). This is why
`remdo-feature-flow` commits its phase-4 work before invoking refine.

So that each cycle reviews the previous one's result, **commit every applied
fix** before re-running the ladder — the fix then lands inside the resolved range
and the tree stays clean for the next pass.

## The ladder

Three passes, cheapest and most local first, most independent last. Each reviews
the same resolved range.

**Run each in-session review pass (1 and 2) as a fresh, context-limited
subagent** given only the range — the coordinating session's memory of
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
   unchanged upstream text.
2. **Internal review** — `/code-review` at max effort against the resolved
   range's base.
3. **External review** — `codex review --base <range base>` for an independent
   outside read. Give it **scope only, no review angle** — leading prompt framing
   defeats the point.

Forward the `AGENTS.md` findings-suppression rule to every pass and subagent.

## The loop

Each pass produces findings. Triage, apply and **commit** what is approved, then
**restart from pass 1** — a simplify or internal pass should always see the
post-fix code first.

- **Approved fix** — clearly correct and safe (or an intended change the diff owns).
  Apply and commit it; the run is not done.
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

## Permissions

Refine commits each fix, so invoking it is an explicitly declared autonomous
scope (per AGENTS.md): authorization to commit **on the current branch**,
whatever it is — never push. Inside a `remdo-feature-flow` run, that skill's
commit policy already governs.

## Final report

Index the result, do not re-narrate it: scope and base; cycle count and why the
loop ended; fixes applied (pointing at files, not prose, with a tally of how many
came from the **latest commit** vs. **earlier branch work** — where in the
resolved range each finding sat); tradeoffs taken with a pointer to their
`docs/todo.md` entries; any blocker with its gathered data; and the final checks
with pass/fail.

Then one **per-rung counts** line each for simplify / internal / external: how
many times it ran, findings it surfaced, and findings applied.

## References

- Sequenced tools: `/simplify`, `/code-review`, `codex review`.
- Loop/loop-guard prior art: `remdo-deps-refresh` skill.
- Branch base and the calling flow: `remdo-feature-flow` skill.
- Keeping `wip-base` current against `origin/main`: `remdo-sync` skill.
- Skill-authoring rule, findings-suppression, and checks: `AGENTS.md`.
