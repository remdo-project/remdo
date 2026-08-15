# remdo-prepare-change

The skill is the developer-facing entry for a repository change. It owns the
lifecycle and handoff and returns an [agent result](../protocol.md#results);
participating capabilities retain their contracts.

## Authority

[Repository authority](../../../../AGENTS.md#repository-authority): after quick
dialogue, the skill may create or switch to the owning branch and transfer only
work adopted by the change. After approval, it may edit and commit approved
change work, including participant-defined commit units.

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
[agent: execute approved change]                    {C}
    ├─ approved behavior must change ─> ↩ prepare spec
    │ executed
    v
[agent: remdo-converge-change]                      {C+F}
    ├─ stopped or not converged ─> [developer: decide concern]
    │                                ├─ retry ─> ↩ affected step
    │                                └─ stop ──> [stopped]
    │ converged
    v
[ready-for-review]
    │ handoff
    v
[developer: review]
    ├─ requirements feedback ─> ↩ quick dialogue
    ├─ spec feedback ─────────> ↩ prepare spec
    ├─ implementation feedback ─> ↩ execute approved change
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
  [aggregates](../protocol.md#aggregation) participant results for handoff. Only
  the coordinator advances the lifecycle; incomplete results leave it unchanged.
- **Quick dialogue.** Establishes the outcome, constraints, non-goals, and
  observable completion through focused developer decisions.
- **Exploration.** Begins at the developer's request or accepted recommendation
  to investigate material uncertainty. Its transition establishes the question,
  scope, any required [repository authority](../../../../AGENTS.md#repository-authority), expected result,
  and return point. Repository changes remain disposable unless adopted.
- **Owning branch ready.** Before retaining work, fetch `origin/main` and ensure
  the current [topic branch](../../../../CONTRIBUTING.md#git-workflow) uses its
  fetched commit as the base and contains only work adopted by the change. Use
  another base only if the developer specified one.
- **Specification.** The coordinator identifies current contract owners and
  prepares the spec by mapping proposed target behavior to the applicable
  owners. It applies [Specification structure](../../../documentation.md#specification-structure)
  when creating or editing a durable specification, changes only owners whose
  target behavior must change, and surfaces unresolved behavior, [concerns](../protocol.md#concerns), and
  [tracked gaps](../../../todo.md#tracked-follow-up) before developer review.
- **Approval.** Developer approval establishes target behavior, not exact wording.
- **Execution.** The coordinator performs undelegated work and invokes
  applicable capabilities with their declared [calls](../protocol.md#calls),
  populated only from guarantees it has established and authority it holds. It
  retains their complete results; participants do not advance the lifecycle or
  expand the approved behavior.
- **Convergence.** [`remdo-converge-change`](remdo-converge-change.md) runs once
  as a black box over the complete [change scope](../change-scope.md) and owns
  the quality loop. Before it runs, the coordinator makes all adopted committed
  and uncommitted work
  representable as one supported scope. If that requires repository authority
  the coordinator does not hold, it surfaces a concern and does not start
  convergence. Developer review requires a `converged` result for the latest
  repository state.
- **Handoff.** The coordinator's [report](../protocol.md#reports) includes the
  exact scope, approved target behavior and its contract owners, participant
  work, convergence result, unhandled concerns, tracked gaps, and specific
  manual review needs. It precedes any request for developer acceptance or
  authority for subsequent repository or remote action.
- **Feedback.** Returns to the earliest affected lifecycle step; repository
  changes invalidate all later quality results.

## Result

The result uses this complete shape with the shared
[`Concern`](../protocol.md#concerns) and
[`ChangeScopeResult`](../change-scope.md#result-type) types:

```yaml
outcome: <ready-for-review | completed | stopped>
reason: <condition that stopped preparation> # if stopped
concerns: <Concern[]> # if any
scope: <ChangeScopeResult> # if resolved
target_behavior: # if approved
  - summary: <approved behavior>
    owner: <contract path>
participants: # if capabilities ran
  - capability: <capability>
    result: <complete capability result>
convergence: <complete remdo-converge-change result> # if run
tracked_gaps: # if any
  - <gap>
manual_review: # if any
  - <specific need>
```

`ready-for-review` presents the handoff for developer review. `completed` means
the developer accepted it. `stopped` means the workflow ended before acceptance.
