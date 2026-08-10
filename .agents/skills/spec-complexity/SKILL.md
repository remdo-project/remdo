---
name: spec-complexity
description: Assess a selected RemDo change or repository subject against applicable contracts, implementation, tests, and Git history to report accepted-behavior decisions that cause material complexity, simpler alternatives, and target complexity those contracts do not require. Use when the caller asks what makes a change, component, or specification complex or how its accepted behavior could be simplified. Remains read-only and does not choose or apply an alternative.
---

# Spec Complexity

Assess one [assessment target](../../../docs/specs/agents/assessment-target.md) under
the authoritative
[`spec-complexity`](../../../docs/specs/agents/skills/spec-complexity.md)
contract.

## Resolve the target

For a change target, run the shared resolver from the repository root with its
optional scope:

```sh
sh .agents/skills/_shared/tools/resolve-scope.sh [scope]
```

Stop on a non-zero exit with a `stopped` result. Retain the emitted `STATE`,
`SCOPE`, `BASE`, `HEAD_SHA`, and file list as the resolved target. When `STATE`
is `no-change`, return the complete `no-change` result with that target. For a
subject target, require one existing repository-relative file or directory;
stop when it is missing, outside the repository, or ambiguous.

## Assess the target

For a change target, inspect the diff, its changed end state, and directly
related mechanisms. Exclude unrelated pre-existing complexity. For a subject
target, inspect the named path, its current contracts, implementation, and
tests. In either case, identify the applicable current
[contract owners](../../../docs/documentation.md#ownership) and inspect relevant
Git history. Follow linked contract owners before classifying complexity as
unrequired.

Identify the few decisions that materially drive complexity. For each:

1. Trace the decision from its contract owner to the target implementation and
   tests it requires.
2. Estimate target implementation and test lines separately with a directional
   range.
3. Classify the area by the contract's complexity classes.
4. Name a simpler contract alternative and its behavioral tradeoff.

Use history to distinguish contract cost from incidental implementation
choices. Report substantial target complexity not required by applicable
contracts separately. Prefer causal accuracy over precise estimates: do not
assign a mechanism to a decision unless repository evidence shows that the
decision requires it.

Do not turn the assessment into a correctness review, implementation-preserving
refactor proposal, or exhaustive inventory. Omit Low areas unless the caller
requests them.

## Return

Return the authoritative specification's [Result](../../../docs/specs/agents/skills/spec-complexity.md#result). When
addressing a human, render it under the shared [Reports](../../../docs/specs/agents/protocol.md#reports) contract.
