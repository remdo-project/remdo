# remdo-prepare-change

The skill owns the lifecycle and developer handoff for a repository change and
returns an [agent result](../results.md#results); participating capabilities retain their contracts.

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
[agent: simplify the end state]                     {C+F}
    │
    v
[agent: remdo-converge-change]                      {C+F}
    ├─ stopped or not converged ─> [developer: decide concern]
    │                                ├─ retry ─> ↩ affected step
    │                                └─ stop ──> [stopped]
    ├─ converged; corrections ────> ↩ simplify the end state
    │ converged; no corrections
    v
[ready-for-review]
    │ handoff
    v
[developer: review]
    ├─ requirements feedback ─> ↩ quick dialogue
    ├─ spec feedback ─────────> ↩ prepare spec
    ├─ implementation feedback ─> ↩ implement spec
    └─ accepted ────────────────> [completed]
```

Legend:

- `{C}` coordinator;
- `{F}` fresh subagent;
- `{C+F}` coordinator integrating fresh-subagent work;
- `↩` returns to the named step.

## Lifecycle rules

- **Coordinator.** Retains the approved spec — its [target behavior](../../../documentation.md#target-behavior) and
  [contract owners](../../../documentation.md#ownership) — and owns lifecycle
  state, integration decisions, and undelegated work. It
  [aggregates](../results.md#aggregation) participant results for handoff. Only
  the coordinator advances the lifecycle; incomplete results leave it unchanged.
- **Quick dialogue.** Establishes the outcome, constraints, non-goals, and
  observable completion through focused developer decisions.
- **Exploration.** Begins at the developer's request or accepted recommendation
  to investigate material uncertainty. Its transition establishes the question,
  scope, any required [repository authority](../instructions.md#repository-authority), expected result,
  and return point. Repository changes remain disposable unless adopted.
- **Owning branch ready.** Before retaining work, fetch `origin/main` and ensure
  the current [topic branch](../../../dev/contributing.md#git-workflow) uses its
  fetched commit as the base and contains only work adopted by the change. Use
  another base only if the developer specified one.
- **Specification.** The coordinator identifies current contract owners and
  prepares the spec by mapping proposed target behavior to the applicable
  owners. It applies [Specification structure](../../../documentation.md#specification-structure)
  when creating or editing a durable specification, changes only owners whose
  target behavior must change, and surfaces unresolved behavior, [concerns](../results.md#concerns), and
  [tracked gaps](../../../todo.md#tracked-follow-up) before developer review.
- **Approval.** Developer approval establishes target behavior, not exact
  wording or repository authority.
- **Convergence.** [`remdo-converge-change`](remdo-converge-change.md) runs as a
  black box over the complete [change scope](../change-scope.md). Before it
  runs, the coordinator makes all adopted committed and uncommitted work
  representable as one supported scope. If that requires repository authority
  the coordinator does not hold, it surfaces a concern and does not start
  convergence. Developer review requires a `converged` result that applies no
  corrections after the latest simplification. A repeated end state stops with
  a concern.
- **Handoff.** The coordinator's [report](../results.md#reports) includes the
  exact scope, approved target behavior and its contract owners, verification
  result, unhandled concerns, tracked gaps, and specific manual review needs. It
  precedes any request for developer acceptance or authority for subsequent
  repository or remote action.
- **Feedback.** Returns to the earliest affected lifecycle step; repository
  changes invalidate all later quality results.

## Result

```yaml
outcome: <ready-for-review | completed | stopped>
concerns: # if any
  - source: <originating capability or participant>
    summary: <condition>
scope: <complete change scope> # if resolved
target_behavior: # if approved
  - summary: <approved behavior>
    owner: <contract path>
convergence: <complete remdo-converge-change result> # if run
tracked_gaps: # if any
  - <gap>
manual_review: # if any
  - <specific need>
reason: <condition that stopped preparation> # if stopped
```

`ready-for-review` presents the handoff for developer review. `completed` means
the developer accepted it. `stopped` means the workflow ended before acceptance.
