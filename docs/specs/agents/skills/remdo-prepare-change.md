# remdo-prepare-change

The skill is the developer-facing entry for a repository change. It owns the
lifecycle and handoff and returns an [agent result](../protocol.md#results);
participating capabilities retain their contracts.

## Authority

[Repository authority](../../../../AGENTS.md#repository-authority): the skill may
create or switch to its owning branch and create commits itself or through
participating capabilities.

## Lifecycle

The coordinator owns lifecycle state, integration decisions, and undelegated work.
It [aggregates](../protocol.md#aggregation) participant results, and only it advances the lifecycle.
Returning to an earlier step retains decisions and evidence that remain valid.

1. **Coordinator — Establish the change.** Bound it before retaining work by
   determining the requested outcome, constraints, non-goals, observable
   completion, any developer-selected base, and adopted existing work from
   explicit developer instructions and decisions,
   applicable [accepted contracts](../../../documentation.md#target-behavior), and repository evidence.
   Retain established information without asking the developer to confirm it again.
   If the developer requests a distinct exploration, or material uncertainty
   prevents a sound decision and bounded exploration could resolve it, then
   establish any required [repository authority](../../../../AGENTS.md#repository-authority), its question, scope, expected result,
   and return point. Perform the exploration. It is read-only unless its established
   scope and held authority allow disposable mutations; its repository changes
   remain disposable unless adopted. Integrate its result and repeat this step.
   If a material choice remains unresolved, then obtain a focused developer decision.
   Continue only after the requested change and adopted work are sufficiently bounded.
2. **Coordinator — Ready the owning branch.** Isolate adopted work by fetching
   `origin/main` and basing the current
   [topic branch](../../../../CONTRIBUTING.md#git-workflow) on the fetched commit without unadopted work.
   Use another base only if the developer selected one.
   If repository evidence conflicts with the established base or adopted work,
   then return to **Establish the change**.
   If the owning branch cannot be readied within held authority, then retain a
   [concern](../protocol.md#concerns) and return `stopped`.
3. **Coordinator — Establish target behavior.** Define what execution must realize
   by identifying the current [contract owners](../../../documentation.md#ownership) for the requested outcome.
   When the requested outcome does not change accepted [target behavior](../../../documentation.md#target-behavior),
   retain that behavior and its owners without a new specification or approval.
   Otherwise, map the proposed target behavior to its owners. Change only
   owners whose behavior must change under [Specification structure](../../../documentation.md#specification-structure).
   Surface unresolved behavior, concerns, and [tracked gaps](../../../todo.md#tracked-follow-up).
   Present the resulting target behavior and owners for developer review,
   keeping specification edits uncommitted while target behavior remains under
   review.
   Only approval of that presentation establishes the changed target behavior.
   Requirements feedback returns to **Establish the change**.
   Specification feedback repeats this step.
   Continue once target behavior is established; approval establishes changed
   target behavior, not exact wording.
4. **Coordinator and participants — Execute the established change.** Realize
   target behavior by performing undelegated work and invoking applicable
   capabilities under their declared [calls](../protocol.md#calls).
   Retain their results.
   Participants do not expand established target behavior.
   If execution evidence conflicts with established change information, then return
   to the earliest of **Establish the change** or
   **Establish target behavior** that must change.
   Complete this step with all established change work committed.
5. **Coordinator — Converge the change.** Complete the quality loop before
   developer review. Form one supported [change scope](../change-scope.md) from
   all adopted work and invoke [`remdo-converge-change`](remdo-converge-change.md).
   It runs as a black box over that scope and owns the quality loop.
   If convergence returns `stopped` or `not-converged`, then retain its result.
   The developer chooses to stop or retry from the earliest concern-resolving step.
   A stop returns `stopped`; a retry returns to that step.
   Continue only with a `converged` result for the latest repository state.
6. **Coordinator — Hand off the change.** Support a developer disposition by
   presenting the active result under [Reports](../protocol.md#reports) before requesting
   developer acceptance or authority for subsequent repository or remote work.
   Without a developer disposition, return `ready-for-review`.
   Requirements feedback returns to **Establish the change**.
   Feedback that changes target behavior returns to **Establish target behavior**.
   Other specification feedback returns to **Execute the established change**.
   Implementation feedback follows the same route.
   After any repository mutation, complete the earliest affected step.
   Repeat **Converge the change** before another handoff.
   Developer acceptance returns `completed`.

## Result

The result uses the shared [result fields](../protocol.md#results) and the [`ChangeScopeResult`](../change-scope.md#result-type) type:

```yaml
outcome: <ready-for-review | completed | stopped>
reason: <condition that stopped preparation> # if stopped
decisions: <Decision[]> # if any
concerns: <Concern[]> # if any
scope: <ChangeScopeResult> # if convergence ran
target_behavior: # if established
  - summary: <established behavior>
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
