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
   fresh-context subagent only for an independent question, and give it the
   question without a proposed answer. Continue when the developer asks to
   proceed or the request already frames the change sufficiently.
2. **Branch.** Run `git fetch origin main`. If switching would carry
   uncommitted work, or the owning branch holds commits, that the framed change
   does not adopt, then ask. Otherwise switch to the owning
   [topic branch](../../../CONTRIBUTING.md#git-workflow), creating it with
   `git switch -c <branch> --no-track origin/main` unless the developer named
   another base.
3. **Contracts.** Identify the
   [contract owners](../../../docs/documentation.md#ownership) of the change's
   behavior. If accepted behavior does not change, then say so and continue.
   Otherwise edit only the owners whose behavior changes, leave the edits
   uncommitted, and ask the developer to review the diff. Approval establishes
   the behavior. Feedback revises the edits, or returns to step 1 when it
   changes the direction.
4. **Implement.** Commit the approved contract edits, then realize the
   established behavior. If the work would change established behavior, then
   return to step 3; if it invalidates the direction, then return to step 1.
5. **Converge.** Invoke `/remdo-converge-change`. If it returns `stopped`, then
   report why and ask whether to retry.
6. **Hand off.** Report under the shared
   [Reports](../../../docs/specs/agents/protocol.md#reports) contract: the
   change, the established behavior and its owners, the convergence result,
   tracked gaps, and needed manual review. Behavior feedback returns to step 3
   and implementation feedback to step 4.
