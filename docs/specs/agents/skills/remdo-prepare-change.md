# remdo-prepare-change

The skill owns the lifecycle and developer handoff for a repository change and
returns an [agent result](../results.md#results); participating capabilities
retain their contracts.

## Lifecycle

```text
[interactive: quick dialogue]                       {C}
    ├─ investigate ─> [agent: exploration] {F} ─> ↩ quick dialogue
    │ owning branch ready
    v
[agent: prepare spec]                               {C}
    │ ready for review
    v
[developer: review spec]
    ├─ requirements feedback ─> ↩ quick dialogue
    ├─ revise spec ────────────> ↩ prepare spec
    │ approved
    v
[agent: implement spec]                             {C}
    ├─ approved behavior must change ─> ↩ prepare spec
    │ implemented
    v
[agent: simplify the end state]                     {F}
    │
    v
[agent: remdo-converge-change]                      {C+F}
    ├─ stopped or not converged ─> [developer: decide concern]
    │                                ├─ retry ─> ↩ affected step
    │                                └─ stop ──> [stopped]
    ├─ converged; corrections ────> ↩ simplify the end state
    │ converged; no corrections
    v
[developer: review]
    ├─ requirements feedback ─> ↩ quick dialogue
    ├─ spec feedback ─────────> ↩ prepare spec
    ├─ implementation feedback ─> ↩ implement spec
    └─ accepted ────────────────> [complete]
```

Legend:

- `{C}` coordinator;
- `{F}` fresh subagent;
- `{C+F}` coordinator integrating fresh-subagent work;
- `↩` returns to the named step.

## Lifecycle rules

- **Coordinator.** Retains the approved specification and owns lifecycle state,
  integration decisions, and undelegated work. It
  [aggregates](../results.md#aggregation) participant results for handoff. Only
  the coordinator advances the lifecycle; incomplete results leave it unchanged.
- **Quick dialogue.** Establishes the outcome, constraints, non-goals, and
  observable completion through focused developer decisions.
- **Exploration.** Begins at the developer's request or accepted recommendation
  to investigate material uncertainty. Its transition establishes the question,
  scope, any required
  [repository authority](../../../../AGENTS.md#safety--process), expected result,
  and return point. Repository changes remain disposable unless adopted.
- **Owning branch ready.** Before the first retained change, fetch `origin/main`
  and use its fetched commit as the base unless the developer specified another.
  The current [topic branch](../../../dev/contributing.md#git-workflow) is the
  owning branch when the base is its ancestor and the range from the base
  contains only adopted committed work. Otherwise name a replacement, create it
  at the base, switch to it, and transfer only adopted work. Existing uncommitted
  changes enter the branch only when quick dialogue identifies them as part of
  the change; otherwise they prevent branch readiness.
- **Specification.** The coordinator identifies current
  [contract owners](../../../documentation.md#ownership), edits them only when
  their [target behavior](../../../documentation.md#target-behavior) must
  change, and surfaces unresolved behavior, [concerns](../results.md#concerns),
  and [tracked gaps](../../../todo.md#tracked-follow-up) before developer review.
- **Approval.** Developer approval establishes target behavior, not exact
  wording or repository authority.
- **Convergence.** [`remdo-converge-change`](remdo-converge-change.md) runs as a
  black box over the complete [change scope](../change-scope.md). Before it
  runs, the coordinator makes all adopted committed and uncommitted work
  representable as one supported scope. If that requires repository authority
  the coordinator does not hold, it surfaces a concern and does not start
  convergence. Developer review requires a `converged` result that applies no
  corrections after the latest simplification.
- **Handoff.** The coordinator's [report](../results.md#reports) includes the
  exact scope, approved target behavior and its contract owners, verification
  result, unhandled concerns, tracked gaps, and specific manual review needs. It
  precedes any request for developer acceptance or authority for subsequent
  repository or remote action.
- **Feedback.** Returns to the earliest affected lifecycle step; repository
  changes invalidate all later quality results.

## Result

```yaml
outcome: <completed | stopped>
concerns: # if any
  - source: <originating capability or participant>
    summary: <condition>
scope: <complete change scope> # if resolved
verification: <complete remdo-converge-change result> # if run
reason: <condition that stopped preparation> # if stopped
```

`completed` means the developer accepted the handoff. `stopped` means the
workflow ended before acceptance.
