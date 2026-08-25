# remdo-prepare-change

The skill is the developer-facing entry for a repository change. It owns the
lifecycle and handoff and returns an [agent result](../protocol.md#results);
participating capabilities retain their contracts.

## Authority

[Repository authority](../../../../AGENTS.md#repository-authority): the skill may
create or switch to its owning branch and create commits itself or through
participating capabilities.

## Lifecycle

The coordinator owns lifecycle state and integration decisions.
It [aggregates](../protocol.md#aggregation) participant results, and only it advances the lifecycle.
Returning to an earlier step retains decisions and evidence that remain valid.

1. **Explore and frame the change.**
   - **Interaction:** Short developer–coordinator dialogue. Continue from the
     supplied intent; otherwise ask what the developer wants to explore.
   - **Grounding:** Check relevant repository evidence as questions arise.
     [Accepted contracts](../../../documentation.md#target-behavior) describe the current baseline; a conflict identifies
     behavior the proposed change may need to revise.
   - **Exploration:** Use fresh-context exploration only for a distinct question
     that benefits from separate investigation. Establish its question, scope,
     expected result, and return point first; repository changes remain disposable
     unless the developer adopts them.
   - **Outcome:** A repository-grounded change direction clear enough to name
     its owning branch.
   - **Completion:** When the developer asks to proceed with the framed change,
     continue to **Ready the owning branch**.
2. **Ready the owning branch.**
   - **Setup:** Autonomous. Create or switch to the owning
     [topic branch](../../../../CONTRIBUTING.md#git-workflow). When creating it, use current `origin/main` unless the developer
     selected another base.
   - **Conflict:** If repository evidence contradicts the selected base or
     adopted work, return to **Explore and frame the change**.
   - **Failure:** If the branch cannot be readied within held authority, retain
     a [concern](../protocol.md#concerns) and return `stopped`.
   - **Outcome:** The owning branch isolates the change direction and any
     developer-adopted existing work from unrelated work.
3. **Establish target behavior.**
   - **Analysis:** Autonomous. Identify the current
     [contract owners](../../../documentation.md#ownership). If the change direction does not alter accepted
     [target behavior](../../../documentation.md#target-behavior), retain that behavior and its owners. Otherwise, update only
     owners whose behavior must change under
     [Specification structure](../../../documentation.md#specification-structure), and surface unresolved behavior, concerns,
     and [tracked gaps](../../../todo.md#tracked-follow-up).
   - **Review:** Present changed target behavior and its owners for developer
     review, keeping specification edits uncommitted. Only approval of that
     presentation establishes the behavior; approval does not bind exact wording.
   - **Feedback:** Requirements feedback returns to
     **Explore and frame the change**. Specification feedback repeats this step.
   - **Outcome:** Target behavior mapped to the owners that execution must
     realize, either retained from current contracts or approved by the developer.
4. **Execute the established change.**
   - **Execution:** Autonomous within the established target behavior. The
     coordinator performs undelegated work, invokes applicable capabilities
     under their declared [calls](../protocol.md#calls), and integrates their results.
   - **Boundary:** Execution does not expand the established target behavior. If
     execution evidence invalidates the change direction, return to
     **Explore and frame the change**. If it invalidates only target behavior,
     return to **Establish target behavior**.
   - **Tracking:** Before committing a specification ahead of its implementation,
     create or update a precise tracked gap; remove it when implementation conforms.
   - **Outcome:** Established change work is committed; any implementation left
     for later is precisely tracked.
5. **Converge the change.**
   - **Convergence:** Autonomous. Form one supported
     [change scope](../change-scope.md) from all adopted work and invoke
     [`remdo-converge-change`](remdo-converge-change.md). It runs as a black box
     and owns the complete quality loop over that scope.
   - **Non-convergence:** Retain a `stopped` or `not-converged` result. The
     developer chooses between returning `stopped` and retrying from the earliest
     concern-resolving step.
   - **Outcome:** A `converged` result for the latest repository state.
6. **Hand off for developer review.**
   - **Interaction:** Present the active result under
     [Reports](../protocol.md#reports) before requesting developer acceptance or separate authority for subsequent
     repository or remote work.
   - **Feedback:** Requirements feedback returns to
     **Explore and frame the change**. Feedback that changes target behavior
     returns to **Establish target behavior**. Other specification or
     implementation feedback returns to **Execute the established change**.
     After any resulting repository mutation, repeat **Converge the change**
     before another handoff.
   - **Outcome:** Without a developer disposition, return `ready-for-review`.
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
