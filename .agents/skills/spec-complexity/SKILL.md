---
name: spec-complexity
description: Assess a caller-named specification against its implementation, tests, and Git history to report the key complexity caused by specification decisions, simpler alternatives, and substantial complexity the specification does not require. Use when the caller asks which specification decisions make an implementation complex or how the specification could be simplified. Remains read-only and does not choose or apply an alternative.
---

# Spec Complexity

Assess one specification under the authoritative
[`spec-complexity`](../../../docs/spec/skills/spec-complexity.md) contract.
Remain read-only.

## Assess the specification

Require the caller to name the specification. Read it in full and confirm that
it is the current
[contract owner](../../../docs/documentation.md#ownership). Inspect its
implementation, tests, and relevant Git history.

Identify the few decisions that materially drive complexity. For each:

1. Trace the decision to the implementation and tests it requires.
2. Estimate implementation and test lines separately with a directional range.
3. Classify the area by the contract's complexity classes.
4. Name a simpler specification alternative and its behavioral tradeoff.

Use history to distinguish specification cost from incidental implementation
choices. Report substantial unrequired complexity separately. Prefer causal
accuracy over precise estimates: do not assign a mechanism to a decision unless
repository evidence shows that the decision requires it.

Do not turn the assessment into a correctness review, implementation-preserving
refactor proposal, or exhaustive inventory. Omit Low areas unless the caller
requests them.

## Report

Return the report in the specification's
[Result](../../../docs/spec/skills/spec-complexity.md#result) format. Keep it
within the soft word budget unless causal accuracy requires more:

- sort areas by complexity class, then estimated cost;
- give a deduplicated total implementation/test estimate in the summary;
- put the uniform implementation/test estimate immediately below each heading;
- limit the explanation, alternative, and tradeoff to their decision-relevant
  facts; and
- format the result to pass the repository's normal Markdown lint rules.
