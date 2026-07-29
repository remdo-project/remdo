# spec-complexity

This skill reports which decisions in one specification create material
implementation complexity and what simpler specification alternatives exist.
It remains read-only and does not select or apply an alternative.

## Assessment

The report answers:

> Which spec decisions create complexity, and what simpler alternatives exist?

The skill assesses a specification named by the caller against its current
implementation, tests, and Git history. The specification is the current
[contract owner](../../documentation.md#ownership) for the behavior under
assessment.

Each area caused by the specification identifies:

- the specification decision and resulting implementation mechanism;
- separate implementation and test line estimates;
- a simpler specification alternative; and
- the alternative's main behavioral tradeoff.

Classify areas as High when they dominate implementation or test complexity,
Medium when they remain substantial but contained, and Low when they do not
materially drive the design. Report Low areas only when the caller requests
them. Classifications and estimates are directional, and estimates may overlap.
Causal attribution takes priority over estimate precision: line ranges need
only show relative cost, but repository evidence must connect each mechanism
to the specification decision assigned to it.

The report distinguishes substantial implementation complexity that no
specification decision requires from complexity caused by the specification.

## Result

The report normally stays within 350 words. It favors fewer, broader areas and
one short paragraph per field. Causal accuracy may exceed this soft limit. It
omits progress, next steps, verification results, exhaustive code inventories,
and change narration.

The report conforms to the repository's Markdown lint rules.

The result uses this structure:

```text
# Spec complexity: <specification>

## Summary
**Total estimated cost:** <implementation range> implementation lines; <test range> test lines
<dominant complexity and simplification opportunity>

## Assessed areas

### <area> — <complexity class>

**Estimated cost:** <implementation range> implementation lines; <test range> test lines
<optional estimate qualification or overlap note>

<specification decision and resulting mechanism>

Simpler alternative: <specification change>

Tradeoff: <behavior lost or delegated>

## Complexity not required by the specification

### <area> — <complexity class>

**Estimated cost:** <implementation range> implementation lines; <test range> test lines
<optional estimate qualification or overlap note>

<unrequired mechanism>

Simpler boundary: <implementation complexity to remove>
```

Order areas by complexity class, then by estimated cost. Deduplicate
overlapping estimates in the summary total. Use `None` when `Assessed areas` is
empty and omit `Complexity not required by the specification` when it is empty.
When both are empty, the summary states that no material area was found.
