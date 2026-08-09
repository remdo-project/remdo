---
name: remdo-prepare-change
description: Act as the developer-facing entry for an explicitly requested RemDo repository change, coordinating focused requirements dialogue, owning-branch setup, specification approval, applicable capabilities or direct implementation, simplification, convergence, and handoff. Use when the developer invokes $remdo-prepare-change for a new or existing change.
---

# RemDo Prepare Change

Implement the authoritative [`remdo-prepare-change`](../../../docs/specs/agents/skills/remdo-prepare-change.md)
contract. You are the developer-facing coordinator for the complete lifecycle.

## Coordinate the change

Retain the approved spec, the complete change scope, participant results,
concerns, and lifecycle state. Invoke applicable capabilities only after their
calling conditions and authority can be supplied. Integrate their results
yourself; participants do not advance the lifecycle. Use fresh subagents only
for the exploration and simplification work identified below.

Keep developer dialogue focused on decisions that affect the target. Recommend
exploration when material uncertainty warrants it, but start a fresh exploration
only after the developer requests or accepts it. Give the explorer a bounded
question, scope, result, and return point without your proposed answer.

## Ready the owning branch

After quick dialogue and before the first retained edit, fetch `origin/main`,
determine the base and adopted work, and make one topic branch own only that
work. Use [`create-branch-from-base.sh`](../_shared/tools/create-branch-from-base.sh)
when creating a branch directly from the base; transfer only adopted work when
the contract requires a replacement branch.

Do not advance when unrelated work remains in the candidate range or working
tree. Surface a concern when branch readiness requires an unsafe interpretation
of existing work or a developer decision about the base or adopted scope.

## Prepare and approve the specification

Read [`Documentation`](../../../docs/documentation.md) before preparing the
spec. Identify current contract owners, map proposed target behavior to the
applicable owners, and apply [`Specification structure`](../../../docs/documentation.md#specification-structure)
when creating or editing a durable specification. Change only owners whose
target behavior must change, and retain each approved behavior with its owner in
the active result. Before requesting approval, surface unresolved behavior,
concerns, and tracked gaps.

Require explicit developer approval of the prepared target behavior before
execution. If later evidence requires different behavior, return the
affected contracts for renewed approval before continuing.

## Execute and simplify

Perform undelegated implementation under the repository guidelines. When an
applicable capability owns the work, declare its calling conditions and
authority, invoke it, and retain its complete result. An incomplete result does
not advance the lifecycle. Neither the coordinator nor a participant expands
the approved behavior.

Implement applicable automated coverage, use focused checks while iterating,
and keep every commit within this change's autonomous scope. Participants retain
their contract-defined commit units.

Delegate a bounded, fresh-context simplification review of the complete current
end state. Use `$remdo-simplify` for code and tests; use the applicable
read-only primitive for other artifacts. Give the reviewer the scope and
authoritative contracts, not suspected fixes or implementation rationale. Apply
only behavior-preserving findings, then repeat the relevant focused checks.

## Converge and hand off

Before convergence, make every adopted committed and uncommitted change
representable as one supported [`change scope`](../../../docs/specs/agents/change-scope.md). If that requires
authority you do not hold, surface a concern and stop before convergence.

Invoke `$remdo-converge-change` as a black box over that complete scope. When it
applies corrections, simplify the changed end state. Reinvoke convergence only
when simplification changes the repository; otherwise retain the converged
result for that unchanged state. Stop with a concern rather than revisit an end
state already seen in this outer loop. A stopped or not-converged result returns
to the developer for a retry or stop decision.

For `ready-for-review`, render the active result under the shared
[`Reports`](../../../docs/specs/agents/results.md#reports) contract. Present the
exact scope, approved target behavior and owners, participant work, convergence
result, unhandled concerns, tracked gaps, and specific manual-review needs before
asking for acceptance or further authority. Route feedback to the earliest
affected step. Return `completed` only after developer acceptance.

## Authority

Invocation declares the authoritative specification's autonomous scope. Enter
owning-branch preparation only after quick dialogue and execute only approved
change work. Participant-defined commit units remain within that same scope.

## Return

Return the authoritative specification's [`Result`](../../../docs/specs/agents/skills/remdo-prepare-change.md#result).
When addressing the developer, render it under the shared [`Reports`](../../../docs/specs/agents/results.md#reports) contract.
