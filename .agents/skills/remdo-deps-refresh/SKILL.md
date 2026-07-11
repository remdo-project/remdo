---
name: "remdo-deps-refresh"
description: "Use when refreshing RemDo dependencies. The batched, test-gated replacement for processing Dependabot npm PRs by hand: in one run, apply EVERY available upgrade (lockfile deps, pnpm/Node/GitHub-Actions pins, majors included), then investigate and autoheal any breakage and report what changed, broke, and was fixed. The user runs it and walks away; only genuine dead-ends come back."
---

# Dependency Refresh

## Intent

This skill is the batched, test-gated replacement for processing Dependabot npm
PRs by hand. The user treats Dependabot PRs and security alerts as a single
signal — "something to refresh" — and the first thing they do is run this skill,
then switch to other work. So the skill owns the **whole loop**: apply
everything, investigate any breakage, heal it, and leave a report of what
happened.

Operating principle: **apply everything, then make it green.**

1. **Apply every available upgrade** — lockfile dependencies and the
   out-of-lockfile tooling pins (pnpm, Node, GitHub Actions), **majors included.**
   A deterministic gate surfaces one change at a time and the skill heals each
   before the next (see "The loop"); there is no "stop and ask about this major"
   step — pausing to ask just defers the same work and contradicts the
   run-and-walk-away intent.
2. **The checks are the gate**, not human judgement: the full local suites here,
   plus the CI matrix when the refresh branch is pushed. The push itself stays
   the user's — see Permissions — so report the CI leg as pending, not covered.
   A regression that the suites catch is for the skill to diagnose and fix now,
   from the failure in hand — the same investigation a "stop" would have produced,
   just without the wait.
3. **Report, don't prompt.** The user does not want "heads-up, Node has a new
   major" or "heads-up, unit tests failed." They want, after the fact: what was
   upgraded, what broke, what was done about it, and what (if anything) is a true
   dead-end. Surface only genuine dead-ends — a break the skill could not safely
   resolve, or a change whose correctness the tests cannot establish.

## Start on a fresh branch

At the start of each new run, before applying an update, run:

```sh
sh .agents/skills/remdo-deps-refresh/tools/start-refresh-branch.sh
```

The script refuses a dirty tree, fetches `origin`, and creates the next available
`chore/deps-refresh-<date>` branch from the fetched `origin/main` without an
upstream. Record the reported branch and base for the final response. On a
non-zero exit, resolve the condition it names or report it as a dead-end; never
apply refresh changes on the branch where the skill was invoked. When continuing
the same run after an interruption, stay on its recorded refresh branch instead
of starting another run.

## The loop

The work is a loop the skill drives — that is where the autohealing lives. The
deterministic part is scripted: `pnpm run deps:next` (this skill's
`next-update.sh`) runs an ordered list of update steps and **stops at the first
one that changes the repo**, so the skill always handles exactly one change at a
time. The gate itself only *detects* which step did work. Version-selection
policy lives in the deterministic `bump-*.sh` helpers each step runs (latest
pnpm release with its exact corepack hash, newest LTS Node whose alpine base is
published, latest
release major for floating action tags); the skill's own job is to run the gate
and heal whatever the resulting change breaks — not to pick versions itself.

Gate exit codes:

- **3** — a step changed the repo; the gate printed which one. Investigate that
  one change, make it green, then run the gate again.
- **0** — every step was a no-op. Nothing left to update; go to "Finish".
- **other (1, 2, …)** — a step itself errored (network, a helper, or the
  `audit:policy` pin guard). A real failure to debug, then re-run.
  Known case: right after the `pnpm pin` item crosses a pnpm **major**, the next
  gate run fails with `ERR_PNPM_UNEXPECTED_STORE` (node_modules was linked by the
  old major). Heal it with `CI=true pnpm install --no-frozen-lockfile` to rebuild
  the store, then re-run the gate.

Iterate:

1. Run `pnpm run deps:next`.
2. **Exit 3** — the gate names the changed item (e.g. `lockfile deps`,
   `pnpm pin`, `node pins`, `github actions`). Handle just that item:
   1. Verify it green: `pnpm run check:full`, `pnpm run test:e2e`,
      `pnpm run audit:cleanup`, and
      `CI=true pnpm install --no-frozen-lockfile` as the consistency gate. For a
      **Node** change also run `pnpm run test:e2e:docker` (the only local surface
      that exercises the alpine base); other items lean on the docker-tests CI job
      when the refresh branch is pushed.
   2. **If anything fails, heal it — this is the core job, not a hand-back.**
      Diagnose from the failure in hand and fix forward: adjust a workaround in
      [dependency-maintenance.md](../../../docs/dev/dependency-maintenance.md),
      pin a known-bad transitive, correct config, or make the minimal code/test
      change the bump requires. Re-run until green. When the failure doesn't
      name its culprit (the lockfile item moves many packages at once), bisect
      it: restore `pnpm-workspace.yaml` + `pnpm-lock.yaml`, re-apply the
      catalog bumps in halves — running `CI=true pnpm install
      --no-frozen-lockfile` after each half so `node_modules` matches it — and
      re-run the failing check.
   3. For a notable jump, skim the release notes — to inform the fix and to flag
      a behavior-affecting change for the report. Opportunistically apply a
      simplification newly-provided functionality enables (upside, never a
      per-package chore).
3. **Loop guard (detect a hang):** if the gate reports the **same item** twice in
   a row with no forward progress — your handling didn't actually resolve it —
   stop iterating on it and investigate why (a helper that keeps re-applying, a
   fix that doesn't stick). Treat an unresolvable one as a dead-end (report), not
   an infinite loop.
4. Repeat until the gate exits 0.

## Permissions

Running this skill is an explicitly declared autonomous scope (per AGENTS.md):
invoking it authorizes the initial fetch and topic-branch creation, then the loop
commits each healed upgrade on the branch reported by the startup script. Never
commit on `main` or `dev`, and never push. Pushing the refresh branch to trigger
the CI matrix stays a separate explicit ask by the user.

## Finish

Once the gate is green (exit 0):

1. Run `pnpm run audit:stats:update` once to refresh the dependency-stats
   baseline to whatever this run landed. Only its exit code matters — do not
   inspect the delta (the strict check is intentionally not part of the loop).
2. Review [dependency-maintenance.md](../../../docs/dev/dependency-maintenance.md)
   as a whole: drop workarounds whose reason is now gone; re-check held-backs.
3. Reconcile open Dependabot PRs and alerts via `gh` — bookkeeping, not a second
   decision loop. Apply only genuine `unresolved` follow-ups. Classify each:
   `covered here`, `already on default branch`, `unresolved`, or
   `blocked intentionally`.

## Final Response

A report of what happened — the user reads this after walking away, so make it
self-contained. Sections (omit a section if empty):

1. **Upgraded** — notable version bumps (lockfile deps) and the tooling pins
   (pnpm, Node, GitHub Actions), with majors marked.
2. **Majors crossed** — each major bump applied this run, with a
   changelog/release-notes link and a one-line "behaviour to watch" note where the
   notes flag something. This is the curated starting point for later
   investigation if something feels off — the value the old "stop" gave, delivered
   as a report.
3. **Broke / fixed** — every check that failed, the root cause, and the fix
   applied to make it green. The point of the run: show the work, not just "all
   green".
4. **Docs reviewed** — `dependency-maintenance.md` workarounds/held-backs dropped
   or moved.
5. **Dependabot reconciliation** — each item classified (`covered here` /
   `already on default branch` / `unresolved` / `blocked intentionally`).
6. **Dead-ends** — anything the skill could not safely resolve (a needed broad
   migration, an ambiguous behavior change the tests cannot adjudicate), with what
   was tried. Omit if none. This is the only category that genuinely needs the
   user; everything else was handled.
7. **Checks** — each final verification command with its pass/fail result, the
   refresh branch and base, and the CI matrix leg marked pending until the user
   pushes that branch.
