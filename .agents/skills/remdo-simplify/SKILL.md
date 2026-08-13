---
name: remdo-simplify
description: Assess a selected RemDo change or repository subject for concrete behavior-preserving code and test simplifications. Use only for an explicitly requested simplify assessment or as a fresh read-only participant composed by another capability. Supports assessment targets and reports findings and options without editing or choosing product behavior.
---

# RemDo Simplify

Assess one [assessment target](../../../docs/specs/agents/assessment-target.md) under the authoritative [`remdo-simplify`](../../../docs/specs/agents/skills/remdo-simplify.md) contract.

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

## Inspect the end state

For a change target, inspect the diff, its changed code and tests, and directly
related implementation that determines the changed end state. For a subject
target, inspect the named path, its implementation and tests, and direct
boundaries that determine its shape.

Read only enough surrounding material to judge a simpler end state: applicable
current contract owners, behavior-defining tests and fixtures, existing helpers
and platform primitives, and direct callers or callees. For editor work, inspect
current RemDo and Lexical patterns before proposing custom machinery.

Keep accepted behavior fixed. Treat documentation and skill prose as evidence,
not simplification subjects. Stop following references when their connection to
the target becomes speculative.

## Identify simplifications

Look for deletable compatibility or defensive machinery, duplicated state or
branches, replaceable custom plumbing, misplaced ownership, unnecessarily broad
interfaces, and test setup that obscures known fixture behavior. Count every
required companion edit when deciding whether the resulting end state is simpler.

Apply the specification's finding bar. Use an option for a real tradeoff and
recommend one only when repository evidence supports it. Do not turn the
assessment into a general correctness review or choose new product behavior.

## Return

Return the authoritative specification's [Result](../../../docs/specs/agents/skills/remdo-simplify.md#result). When
addressing a human, render it under the shared [Reports](../../../docs/specs/agents/protocol.md#reports) contract.
