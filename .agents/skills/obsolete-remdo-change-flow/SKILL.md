---
name: obsolete-remdo-change-flow
description: Reference-only snapshot of RemDo's retired OpenSpec-backed change workflow. Never invoke it to conduct current work.
---

# Obsolete Change Flow

## Overview

This retired procedure is preserved as migration evidence. Do not invoke it.
It previously conducted a spec-bearing RemDo change through the lifecycle
defined by the
[`development-change-workflow`](../../../openspec/specs/development-change-workflow/spec.md).
Compose the installed OpenSpec skills; do not reproduce or modify their
generated procedures.

The main specs are the user review surface. The active change remains the
transport, design history, and implementation-gap ledger.

## Select the lifecycle state

Run the deterministic branch gate before an OpenSpec action:

- **Starting a change:**

  ```sh
  pnpm exec tsx \
    .agents/skills/obsolete-remdo-change-flow/tools/change-gate.ts start
  ```

  Continue only with no active change. Confirm the task branch with the user
  before creating or switching branches.
- **Continuing a change:**

  ```sh
  pnpm exec tsx \
    .agents/skills/obsolete-remdo-change-flow/tools/change-gate.ts continue <name>
  ```

  Continue only when that name is the branch's sole active change.

A different change requires a different branch or worktree. Do not archive,
delete, or relocate an active change merely to pass the gate.

## Phase 1 — Explore

Use `openspec-explore` to investigate the problem and agree on the intended
behavior. Read the current owning docs/specs and relevant code. Do not change
implementation during this phase.

When the requirements are ready to specify, proceed on the confirmed task
branch.

## Phase 2 — Prepare the contract review

1. Use `openspec-propose` to create the standard proposal, design, delta specs,
   and tasks.
2. Check the installed OpenSpec surfaces before adding custom mechanics. Prefer
   a suitable upstream primitive when one exists.
3. Use `openspec-sync-specs` to materialize every delta in its main spec.
4. Reconcile the tasks so every known gap between the target specs and the
   implementation remains incomplete.
5. Validate the change strictly.
6. Present the main specs and active tasks together for explicit user approval.
   Proposal and design remain supporting context, not duplicate contract review
   surfaces. Leave implementation unchanged.

## Phase 3 — Approve and freeze

Approval covers the main specs and active tasks together. Before recording it:

1. Confirm the main specs express the intended target in their durable context.
2. Confirm each delta and corresponding main spec are equivalent after applying
   delta operations; textual identity is not required.
3. Confirm incomplete tasks disclose every known implementation gap.
4. Run strict OpenSpec validation and the documentation checks required by
   `AGENTS.md`.

Record approval at a commit boundary. A direct user request to commit, or an
autonomous scope declared by a calling skill, supplies commit authorization;
this skill supplies none by itself. Record the resulting commit as the approved
baseline in the run handoff or `.agent/` scratch so later sessions can compare
against it. If the baseline cannot be identified unambiguously, ask the user
before implementation.

## Phase 4 — Implement against the baseline

1. Re-run the `continue` branch gate.
2. Use `openspec-apply-change` to implement the incomplete tasks.
3. Change code, tests, and task completion without changing approved
   requirements.
4. Keep going until all gaps close or a real blocker appears.

If implementation reveals that an approved requirement must change, stop the
implementation loop. Use `openspec-update-change` to revise the planning
artifacts, use `openspec-sync-specs` to update the main specs, reconcile the
tasks, and return to the explicit review and approval gate. The new approval
commit becomes the baseline.

## Phase 5 — Verify and archive

Before archival:

1. Re-run the `continue` branch gate.
2. Compare the implementation and tests against the approved main specs in both
   directions: specified but missing, and implemented but unspecified.
3. Confirm every task is complete.
4. Confirm each delta still produces the corresponding main spec.
5. Confirm approved requirements have not changed since the recorded baseline.
6. Run strict OpenSpec validation and the checks required by `AGENTS.md`. Use an
   installed upstream verification surface when available, but it does not
   replace RemDo's checks.

Resolve failures before proceeding. Then use `openspec-archive-change` and
archive with `--skip-specs`; the deltas were synchronized before approval.
Archival and any archive-only commit still require authorization from the user
or a calling autonomous scope. Pushes and PR operations always remain separate.

## Permissions

This skill does not declare an autonomous scope. Follow the commit, index,
branch, remote, test, and worktree rules in `AGENTS.md`. A calling skill may
provide a narrower autonomous scope; preserve its limits.

## References

- Durable lifecycle requirements:
  `openspec/specs/development-change-workflow/spec.md`.
- Retired active-change gate:
  `.agents/skills/obsolete-remdo-change-flow/tools/change-gate.ts`.
- Documentation invariants: `docs/documentation.md`.
- Repository permissions and checks: `AGENTS.md`.
