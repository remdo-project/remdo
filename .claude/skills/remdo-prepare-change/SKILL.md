---
name: remdo-prepare-change
disable-model-invocation: true
description: Take one RemDo change from an idea to a converged topic branch ready for developer review by framing it in chat, establishing any contract changes, implementing, and converging. Use when the developer invokes /remdo-prepare-change.
argument-hint: "[change description]"
---

# RemDo Prepare Change

## Authority

Under [repository authority](../../../AGENTS.md#repository-authority), the skill
may create or switch to the owning topic branch in step 2 and commit in step 4.
[`/remdo-converge-change`](../remdo-converge-change/SKILL.md) holds its own
authority in step 5.

## Steps

1. **Frame.** Discuss the change with the developer until its direction is
   clear, grounding questions in repository evidence and the
   [accepted contracts](../../../docs/documentation.md#target-behavior). Use a
   read-only fresh-context subagent only for an independent question, and give
   it the question without a proposed answer. Continue when the developer asks
   to proceed or the request already frames the change sufficiently.
2. **Branch.** Run `git fetch origin main`. If switching would carry
   uncommitted work the framed change does not adopt, or the owning branch holds
   commits it does not adopt, then ask. Otherwise switch to the owning
   [topic branch](../../../CONTRIBUTING.md#git-workflow), creating it with
   `git switch -c <branch> --no-track origin/main` unless the developer named
   another base. Record the commit the branch forks from as its base.
3. **Contracts.** Identify the
   [contract owners](../../../docs/documentation.md#ownership) of the change's
   behavior. If accepted behavior does not change, then say so and continue.
   Otherwise edit only the owners whose behavior changes, leave the edits
   uncommitted, and ask the developer to review the diff. Approval establishes
   the behavior. Feedback revises the edits, or returns to **Frame** when it
   changes the direction.
4. **Implement.** Commit the approved contract edits, then realize the
   established behavior and commit it. If the work would change established
   behavior, then return to **Contracts**; if it invalidates the direction,
   then return to **Frame**.
5. **Converge.** Invoke `/remdo-converge-change <base>..HEAD` with the recorded
   base. If it returns `stopped`, then report why and ask whether to retry from
   **Converge** or from the earliest step its reason invalidates.
6. **Hand off.** Report under the shared
   [Reports](../../../docs/specs/agents/protocol.md#reports) contract: the
   change, the established behavior and its owners, the convergence result
   with its decisions and concerns, tracked gaps, and needed manual review.
   Direction feedback returns to **Frame**, behavior feedback to
   **Contracts**, and implementation feedback to **Implement**.
