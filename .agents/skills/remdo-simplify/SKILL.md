---
name: remdo-simplify
description: Assess a selected RemDo change or repository subject for concrete behavior-preserving code and test simplifications. Use only for an explicitly requested simplify assessment or as a fresh read-only participant composed by another capability. Supports assessment targets and reports findings and options without editing or choosing product behavior.
---

# RemDo Simplify

Read the authoritative
[`remdo-simplify`](../../../docs/specs/agents/skills/remdo-simplify.md)
specification in full before resolving or assessing a target. The procedure
below only binds target resolution and supplies replaceable evidence-discovery
heuristics.

## Repository bindings

Resolve the input under the shared
[assessment-target](../../../docs/specs/agents/assessment-target.md) contract.
For a change target, run the shared resolver from the repository root with its
optional scope:

```sh
sh .agents/skills/_shared/tools/resolve-scope.sh [scope]
```

Use the emitted complete change-scope result as the resolved target and follow
the specification's outcome for its state.

If the resolver exits non-zero, return `stopped` with its failure evidence as
the reason.

## Assessment procedure

Assess the resolved [Target](../../../docs/specs/agents/skills/remdo-simplify.md#target)
using only enough surrounding evidence to judge a simpler end state: applicable
current contract owners, behavior-defining tests and fixtures, existing helpers
and platform primitives, and direct callers or callees. For editor work, inspect
current RemDo and Lexical patterns before proposing custom machinery. Stop
following references when their connection to the target becomes speculative.

Look for deletable compatibility or defensive machinery, duplicated state or
branches, replaceable custom plumbing, misplaced ownership, unnecessarily broad
interfaces, and test setup that obscures known fixture behavior. Judge each
candidate under the specification's [Findings](../../../docs/specs/agents/skills/remdo-simplify.md#findings)
contract.

## Return

Return the authoritative specification's [Result](../../../docs/specs/agents/skills/remdo-simplify.md#result). When
addressing a human, render it under the shared [Reports](../../../docs/specs/agents/protocol.md#reports) contract.
