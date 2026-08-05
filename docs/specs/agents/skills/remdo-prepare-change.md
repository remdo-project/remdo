# remdo-prepare-change

The skill owns the lifecycle and developer handoff for a repository change;
participating capabilities retain their contracts.

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
    ├─ revise ─> ↩ prepare spec
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
    ├─ corrections applied ─> ↩ simplify the end state
    │ converged
    v
[developer: review]
    ├─ spec feedback ─> ↩ prepare spec
    └─ implementation feedback ─> ↩ implement spec
```

Legend:

- `{C}` coordinator;
- `{F}` fresh subagent;
- `{C+F}` coordinator integrating fresh-subagent work.

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
- **Owning branch ready.** Before the first retained change, fetch
  `origin/main`, name a
  [topic branch](../../../dev/contributing.md#git-workflow), create it at the
  fetched commit, and switch to it. Use another base only if the developer
  specified one.
- **Specification.** The coordinator identifies current
  [contract owners](../../../documentation.md#ownership), edits them only when
  their [target behavior](../../../documentation.md#target-behavior) must
  change, and surfaces unresolved behavior and
  [concerns](../results.md#concerns) before implementation.
- **Approval.** Developer approval establishes target behavior, not exact
  wording or repository authority.
- **Convergence.** [`remdo-converge-change`](remdo-converge-change.md) runs as a
  black box over the complete [change scope](../change-scope.md). Developer
  review requires a `converged` result that applies no corrections after the
  latest simplification.
- **Handoff.** The coordinator's [report](../results.md#reports) includes the
  exact scope, approved target behavior and its contract owners, verification
  result, unhandled concerns,
  [tracked gaps](../../../todo.md#tracked-follow-up), and specific manual review
  needs. It implies neither acceptance nor authority for subsequent repository
  or remote action.
- **Feedback.** Returns to the earliest affected lifecycle step; repository
  changes invalidate all later quality results.
