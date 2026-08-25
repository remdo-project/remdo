# remdo-prepare-change

The skill is the developer-facing entry for a repository change. It owns the
lifecycle and handoff and returns an [agent result](../protocol.md#results);
participating capabilities retain their contracts.

## Authority

[Repository authority](../../../../AGENTS.md#repository-authority): the skill may
create or switch to its owning branch during **Ready the owning branch** and
create commits during **Execute the established change**, itself or through
participating capabilities. During **Converge the change**,
`remdo-converge-change` retains its declared repository authority.

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
     expected result, and return point first. It is read-only and receives no
     proposed answer.
   - **Outcome:** A repository-grounded change direction and its adopted
     existing work, clear enough to name the owning branch.
   - **Completion:** Advance only after resolving any condition that returned to
     this step and when the developer asks to proceed or the supplied intent
     already requests work on a sufficiently framed change.
2. **Ready the owning branch.**
   - **Setup:** Autonomous. Before changing branches, identify work the branch
     operation would carry and work the owning branch already contains. If any
     of it is not adopted for the change, return to **Explore and frame the
     change**. Create or switch to the owning
     [topic branch](../../../../CONTRIBUTING.md#git-workflow). When
     creating it, use origin's `main` commit observed when this step began
     unless the developer selected another base.
   - **Conflict:** If repository evidence contradicts the selected base or
     adopted work, or adopted uncommitted work cannot remain on that base within
     held authority, return to **Explore and frame the change** for a developer
     decision. If the conflict remains unresolved, return `stopped`.
   - **Failure:** If the branch cannot be readied within held authority, retain
     a [concern](../protocol.md#concerns) and return `stopped`.
   - **Outcome:** The owning branch contains only work the developer adopted for
     the framed change.
3. **Establish target behavior.**
   - **Analysis:** Autonomous. Identify the current
     [contract owners](../../../documentation.md#ownership). If no specification
     feedback is pending and the change direction does not alter accepted
     [target behavior](../../../documentation.md#target-behavior), retain that behavior and its owners and continue to
     **Execute the established change**. Otherwise, update only owners whose
     behavior must change under [Specification structure](../../../documentation.md#specification-structure), and surface
     unresolved behavior, concerns, and [tracked gaps](../../../todo.md#tracked-follow-up).
   - **Review:** When target behavior changes or specification feedback is
     pending, present the changed behavior and its owners for developer review,
     keeping specification edits uncommitted. Only approval of that presentation
     establishes changed behavior; approval does not bind exact wording.
   - **Feedback:** Requirements feedback returns to
     **Explore and frame the change**. Specification feedback updates the
     presentation and repeats **Review** within this step.
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
   - **Convergence:** Autonomous. Make all adopted work representable by one
     supported [change-scope input](../change-scope.md#resolution) and invoke
     [`remdo-converge-change`](remdo-converge-change.md).
   - **Scope failure:** If one supported scope cannot be formed within held
     authority, retain a [concern](../protocol.md#concerns) and return `stopped`.
   - **Non-convergence:** If convergence returns `stopped` or `not-converged`,
     retain the complete nested result and identify the lifecycle step affected
     by its reported condition. Ask the developer whether to stop or retry from
     that step. If they stop, return `stopped`; if they retry, return to the
     identified step.
   - **Outcome:** A `converged` result for the latest repository state.
6. **Hand off for developer review.**
   - **Interaction:** Present the active result under
     [Reports](../protocol.md#reports) before requesting developer acceptance or separate authority for subsequent
     repository or remote work.
   - **Feedback:** Resume the lifecycle from the named step. Requirements
     feedback returns to
     **Explore and frame the change**. Specification feedback updates the
     presentation and returns to **Review** in **Establish target behavior**.
     Implementation feedback returns to **Execute the established change**.
     After any resulting repository mutation, the resumed lifecycle must reach
     **Converge the change** before another handoff.
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
the developer accepted it. Both outcomes include the established
`target_behavior`, the latest `converged` result, and its `scope`; the top-level
`scope` is identical to `convergence.scope`. `stopped` means the workflow ended
before acceptance.
