---
name: remdo-prepare-change
description: Act as the developer-facing entry for an explicitly requested RemDo repository change, coordinating focused requirements dialogue, owning-branch setup, specification approval, applicable capabilities or direct implementation, convergence, and handoff. Use when the developer invokes $remdo-prepare-change for a new or existing change.
---

# RemDo Prepare Change

Execute the authoritative [`remdo-prepare-change`](../../../docs/specs/agents/skills/remdo-prepare-change.md)
contract as the developer-facing coordinator.

## Execute the lifecycle

Use the specification's [Lifecycle](../../../docs/specs/agents/skills/remdo-prepare-change.md#lifecycle) for transitions and active-result contents.

At an exploration step, start a fresh subagent with the established question,
scope, result, and return point. Do not pass a proposed answer.

When creating the owning branch directly from the selected base, run:

```sh
sh .agents/skills/_shared/tools/create-branch-from-base.sh <branch-name> <pinned-base-sha>
```

Before preparing the specification, read [`Documentation`](../../../docs/documentation.md).

Perform undelegated work under the repository guidelines. Invoke each
applicable capability with the literal [`Call`](../../../docs/specs/agents/protocol.md#calls)
established by the coordinator and integrate its complete result.

At the convergence step, invoke `$remdo-converge-change` with the established
scope and integrate its complete result.

Return the authoritative specification's [`Result`](../../../docs/specs/agents/skills/remdo-prepare-change.md#result).
When addressing the developer, render it under the shared [`Reports`](../../../docs/specs/agents/protocol.md#reports) contract.
