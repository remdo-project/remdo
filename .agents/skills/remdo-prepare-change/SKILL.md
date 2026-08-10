---
name: remdo-prepare-change
description: Act as the developer-facing entry for an explicitly requested RemDo repository change, coordinating focused requirements dialogue, owning-branch setup, specification approval, applicable capabilities or direct implementation, convergence, and handoff. Use when the developer invokes $remdo-prepare-change for a new or existing change.
---

# RemDo Prepare Change

Execute the authoritative
[`remdo-prepare-change`](../../../docs/specs/agents/skills/remdo-prepare-change.md)
contract as the developer-facing coordinator.

## Retain the lifecycle

Retain the approved spec, the complete change scope, participant results,
concerns, and lifecycle state in one active result. Follow the specification's
diagram for every transition; only the coordinator advances it.

At an approved exploration step, start a fresh subagent with the established
question, scope, result, and return point. Do not pass a proposed answer.

## Ready the owning branch

Fetch `origin/main`. When creating a branch directly from the selected base,
run:

```sh
sh .agents/skills/_shared/tools/create-branch-from-base.sh <branch-name> <pinned-base-sha>
```

When branch readiness requires replacement, transfer only the adopted work.

## Prepare and approve the specification

Read [`Documentation`](../../../docs/documentation.md), edit the current contract
owners under its specification rules, and present the resulting target behavior
and owners for approval. Keep unresolved decisions and tracked gaps in the
active result.

## Execute the change

Perform undelegated work under the repository guidelines. Invoke each
applicable capability with the literal [`Call`](../../../docs/specs/agents/protocol.md#calls)
established by the coordinator and integrate its complete result.

## Converge and return

Represent all adopted work as one supported
[`change scope`](../../../docs/specs/agents/change-scope.md), then invoke
`$remdo-converge-change` once with that scope. Integrate its complete result.

Return the authoritative specification's
[`Result`](../../../docs/specs/agents/skills/remdo-prepare-change.md#result).
When addressing the developer, render it under the shared
[`Reports`](../../../docs/specs/agents/protocol.md#reports) contract before
requesting acceptance or further authority.
