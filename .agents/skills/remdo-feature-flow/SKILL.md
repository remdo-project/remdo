---
name: remdo-feature-flow
description: Use when starting a self-contained bigger RemDo change — a new feature or a redesign of something that does not exist yet — and the user wants to drive it from a vague idea to finished, reviewed, locally-committed work. Triggers include "let's design X", "I want to build/redesign X", "feature flow", or a vague drafted idea handed over for development. The user gates only on intent (the spec), not on a detailed plan; execution is autonomous, with the quality loop via `remdo-refine` baked into done.
---

# Feature Flow

## Overview

Drive a self-contained larger feature from a vague idea to finished,
locally-committed work. This skill supplies autonomous implementation and the
quality loop; it delegates the full specification lifecycle to
[`remdo-change-flow`](../remdo-change-flow/SKILL.md).

The user reviews intent in the main OpenSpec specs together with the active
tasks. The final report indexes the implementation diff. `.agent/` remains
agent-only scratch, never a user review surface.

## Preflight — pin the design base

Run `sh .agents/skills/remdo-feature-flow/tools/preflight-base.sh` before
reading feature code or docs. Its output either pins `BASE=<sha>` from a clean,
even-or-behind checkout or explains why the flow must stop. Do not design from
an ahead or diverged base that the task branch would not inherit.

## Phase 1 — Draft and dialog

1. Verify the user's stated facts against the pinned base.
2. Record verified facts and decisions in
   `.agent/plans/<YYYY-MM-DD>-<feature>.md`.
3. Read the owning docs/specs and relevant code before asking residual
   questions.
4. Determine whether the request is one concern or several. Independent
   concerns require separate branches and OpenSpec changes.
5. Use Research only for a concrete question whose answer can materially change
   the contract.

Continue when the intended behavior is ready to specify autonomously.

## Phase 2 — Create the task branch

Require a clean tracked working tree, confirm the branch name and prefix with
the user, then run:

```sh
sh .agents/skills/_shared/tools/create-branch-from-base.sh <name> <pinned-base-sha>
```

Resolve any drift reported by the script before continuing. The active
OpenSpec change belongs to this branch; do not create it on the base branch and
move it later.

## Phase 3 — Delegate specification and approval

Invoke `remdo-change-flow` for exploration handoff, proposal creation, early
spec synchronization, and the approval gate. Supply the verified dialog
outcomes; do not maintain a parallel docs-first specification.

The user reviews the main specs and active tasks. This is the only mandatory
user gate. On approval, this skill's autonomous scope authorizes the local
baseline commit required by `remdo-change-flow`. If the user rejects the
contract, revise through that flow or remove flow-owned artifacts before
exiting.

## Phase 4 — Autonomous execution

1. Resume `remdo-change-flow` from its approved implementation phase and use
   the active tasks as the gap ledger.
2. Repeatedly compare implementation with the approved main specs and close the
   next gap. Prefer test-first work for new behavior. Reproduce and isolate
   failures before fixing them.
3. If implementation invalidates a requirement, return through
   `remdo-change-flow`'s revision and renewed-approval gate. Do not silently edit
   an approved spec.
4. For user-facing behavior, verify live per `AGENTS.md` and add automated
   coverage at the appropriate level.
5. When the tasks appear complete, run a fresh-context compliance read in both
   directions: specified but missing and implemented but unspecified. Pass only
   the approved main specs, active tasks, branch diff scope, and the
   `AGENTS.md` finding-suppression rule.
6. Fix accepted findings, then commit the implementation. If `origin/main`
   advanced, suggest `remdo-sync` after the tree is clean.
7. Run `remdo-refine` over `origin/main...HEAD`. It owns simplification,
   internal review, final repository checks, and its quality report.
8. Resume `remdo-change-flow` for final convergence verification and archival
   with spec synchronization skipped. This autonomous scope authorizes the
   archive-only local commit; it never authorizes a push.

Use judgment for small implementation choices. A real contract change goes
through renewed approval; a large unresolved implementation fork stops the run
with gathered evidence and options.

## Phase 5 — Report and retro

Report:

1. Changed files/areas as an index, not a re-narration.
2. Tasks and `docs/todo.md` entries resolved or added.
3. Any blocker or deliberate tradeoff.
4. The retained `remdo-refine` scope, end reason, reviewer activity, and final
   check status.
5. Stable workflow improvements applied to the shared skill or owning docs.

The work is locally committed. Merge, push, or PR creation remains a separate
user-owned action.

## Research capability

Use Research for heavyweight investigation against recognized guidelines,
prior art, or established patterns. Bound it by one concrete question. During
autonomous execution, use it when it disambiguates the implementation; during
dialog, suggest it and let the user launch it. Keep findings and discard spike
code.

## Permissions

Invoking this skill is an explicitly declared autonomous scope: it authorizes
branch creation after user confirmation and local commits on that task branch,
including the approved spec baseline, implementation, and archive. It never
authorizes commits on `main` or `dev`, rebases, pushes, pulls, force-pushes, or
PR operations.

## Branch and execution model

The branch diff base is the merge-base of `origin/main` and `HEAD`:

- Committed range: `git diff origin/main...HEAD`.
- Working tree: `git diff "$(git merge-base origin/main HEAD)"` plus untracked
  files.

Use inline dialog for design. Use isolated subagents only when authorized and
materially useful for independent Research, implementation, or required fresh
reads. The final spec-compliance read must use a fresh context; if the runtime
cannot provide one, stop rather than silently weakening it. Do not write agent
memory unless the user explicitly asks.

## Agent adapters

**Claude Code:** Use the installed test-driven development, systematic
debugging, verification-before-completion, parallel-agent, worktree, and branch
finishing skills where their named roles apply. Run the compliance read through
a Claude fork/explore context.

**Codex:** Dispatch the required compliance read through a fresh review agent.
Use worktree-isolated subagents for genuinely independent Phase-4 or Research
work.

## References

- Specification lifecycle: `.agents/skills/remdo-change-flow/SKILL.md`.
- Quality loop: `.agents/skills/remdo-refine/SKILL.md`.
- Syncing `origin/main`: `.agents/skills/remdo-sync/SKILL.md`.
- Branch helpers: `.agents/skills/remdo-feature-flow/tools/preflight-base.sh`
  and `.agents/skills/_shared/tools/create-branch-from-base.sh`.
- Documentation invariants: `docs/documentation.md`.
- Git workflow: `docs/contributing.md#git-workflow`.
- Global permissions, testing, worktrees, and DevTools: `AGENTS.md`.
