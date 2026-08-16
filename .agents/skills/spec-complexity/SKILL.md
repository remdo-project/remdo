---
name: spec-complexity
description: Assess a selected RemDo change or repository subject against applicable contracts, implementation, tests, and Git history to report accepted-behavior decisions that cause material complexity, simpler alternatives, and target complexity those contracts do not require. Use when the caller asks what makes a change, component, or specification complex or how its accepted behavior could be simplified. Remains read-only and does not choose or apply an alternative.
---

# Spec Complexity

Read the authoritative [`spec-complexity`](../../../docs/specs/agents/skills/spec-complexity.md)
specification in full before resolving or assessing a target. Follow it for all
assessment decisions, outcomes, and result contents, and load its linked owners
when their rules apply.

## Resolve the target

Resolve the input under the shared [assessment-target](../../../docs/specs/agents/assessment-target.md) contract.
For a change target, run the shared resolver from the repository root, passing
its optional scope unchanged:

```sh
sh .agents/skills/_shared/tools/resolve-scope.sh [scope]
```

Use the emitted complete change-scope result as the resolved change target and
follow the specification's outcome for its state. Do not introduce another
scope resolver.

## Assess the target

For a resolved target requiring assessment, execute the specification's [Assessment](../../../docs/specs/agents/skills/spec-complexity.md#assessment)
section.

## Return

Return the specification's [Result](../../../docs/specs/agents/skills/spec-complexity.md#result). When
addressing a human, render it under the shared [Reports](../../../docs/specs/agents/protocol.md#reports) contract.
