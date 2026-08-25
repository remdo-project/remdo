---
name: remdo-prepare-change
description: Coordinate an explicitly requested RemDo repository change through interactive framing, owning-branch setup, target-behavior establishment, execution, convergence, and handoff. Use when the developer invokes $remdo-prepare-change for a new or existing change.
---

# RemDo Prepare Change

Read the full [`remdo-prepare-change`](../../../docs/specs/agents/skills/remdo-prepare-change.md) specification before repository work.
Follow its [Lifecycle](../../../docs/specs/agents/skills/remdo-prepare-change.md#lifecycle) algorithm for all lifecycle actions, transitions, and outcomes.
The procedure below only binds its operations to repository mechanisms.

## Repository bindings

At **Ready the owning branch**, fetch `origin/main` and resolve the
developer-selected base or fetched `origin/main` to a commit. When creating the
owning branch directly from that commit, run:

```sh
sh .agents/skills/_shared/tools/create-branch-from-base.sh <branch-name> <pinned-base-sha>
```

Before creating or editing a durable specification, read [`Documentation`](../../../docs/documentation.md).

Perform undelegated work under the repository guidelines. Invoke each
applicable capability with the literal [`Call`](../../../docs/specs/agents/protocol.md#calls)
established by the coordinator and integrate its complete result.

At the lifecycle's **Converge the change** step, invoke `$remdo-converge-change`
with the established scope and integrate its complete result.

## Report

Return the specification's [`Result`](../../../docs/specs/agents/skills/remdo-prepare-change.md#result).
When addressing the developer, render it under the shared [`Reports`](../../../docs/specs/agents/protocol.md#reports) contract.
