# spec-complexity

This read-only skill returns an [agent result](../results.md#results) showing
which decisions in one specification create material implementation complexity
and what simpler alternatives exist. It does not select or apply an
alternative.

## Assessment

The [report](../results.md#reports) answers:

> Which spec decisions create complexity, and what simpler alternatives exist?

The skill assesses a specification named by the caller against its current
implementation, tests, and Git history. The specification is the current
[contract owner](../../../documentation.md#ownership) for the behavior under
assessment.

For each specification-caused area, report the decision, resulting
implementation mechanism, separate implementation and test estimates, simpler
specification alternative, and main behavioral tradeoff.

Classify areas as `high` when they dominate implementation or test complexity,
`medium` when they remain substantial but contained, and `low` when they do not
materially drive the design. Report `low` areas only when the caller requests
them. Classifications are directional; estimates may overlap. Causal
attribution matters more than precision: ranges need only show relative cost,
but repository evidence must connect each mechanism to its assigned
specification decision.

The report also identifies substantial implementation complexity not required
by the specification.

## Result

The result uses this shape:

```yaml
outcome: <complexity-found | no-material-complexity>
specification: <path>
estimated_cost: # if complexity-found
  implementation: <line range>
  tests: <line range>
areas: # if any
  - name: <area>
    cause: <specification | implementation>
    complexity: <high | medium | low>
    estimated_cost:
      implementation: <line range>
      tests: <line range>
    estimate_note: <qualification or overlap> # if needed
    assessment: <specification decision and mechanism or unrequired mechanism>
    alternative: <simpler specification or implementation boundary>
    tradeoff: <behavior lost or delegated> # if cause is specification
```

`complexity-found` means at least one reported area, regardless of cause;
`no-material-complexity` means none. The top-level estimate covers all reported
areas and deduplicates overlaps.

The report normally stays within 350 words and conforms to the repository's
Markdown lint rules. It favors fewer, broader areas and one short paragraph per
area. Causal accuracy may exceed the word limit. It presents
specification-caused areas before implementation-caused areas and orders each
group by complexity, then estimated cost. It omits progress, next steps,
verification results, exhaustive code inventories, and change narration.
