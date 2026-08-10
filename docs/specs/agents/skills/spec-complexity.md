# spec-complexity

This read-only skill returns an [agent result](../protocol.md#results) showing
which accepted-behavior decisions create material implementation complexity
within one [analysis target](../analysis-target.md), what simpler alternatives
exist, and what target complexity those decisions do not require. It does not
select or apply an alternative.

## Target

The capability accepts either analysis-target form:

- `change`: the changed end state and directly related mechanisms, excluding
  unrelated pre-existing complexity;
- `subject`: the named current-tree subject, its implementation, and tests.

All estimates are target-bounded.

## Assessment

The [report](../protocol.md#reports) answers:

> Which accepted-behavior decisions create complexity within the target, and
> what simpler alternatives exist?

The skill assesses the target against its applicable current
[contract owners](../../../documentation.md#ownership), implementation, tests,
and Git history.

For each contract-caused area, report the decision, resulting
implementation mechanism, owner, separate implementation and test estimates,
simpler contract alternative, and main behavioral tradeoff.

Classify areas as `high` when they dominate implementation or test complexity,
`medium` when they remain substantial but contained, and `low` when they do not
materially drive the design. Report `low` areas only when the caller requests
them. Classifications are directional; estimates may overlap. Causal
attribution matters more than precision: ranges need only show relative cost,
but repository evidence must connect each mechanism to its assigned
contract decision.

The report also identifies substantial target complexity not required by the
applicable contracts.

## Result

The result uses this shape:

```yaml
outcome: <complexity-found | no-material-complexity | no-change | stopped>
concerns: # if any
  - source: <originating capability or participant>
    summary: <condition>
target: <resolved analysis target> # if resolved
reason: <condition that prevented assessment> # if stopped
estimated_cost: # if complexity-found
  implementation: <line range>
  tests: <line range>
areas: # if complexity-found
  - name: <area>
    cause: <contract | implementation>
    owner: <contract path> # if cause is contract
    complexity: <high | medium | low>
    estimated_cost:
      implementation: <line range>
      tests: <line range>
    estimate_note: <qualification or overlap> # if needed
    assessment: <contract decision and mechanism or unrequired mechanism>
    alternative: <simpler contract or implementation boundary>
    tradeoff: <behavior lost or delegated> # if cause is contract
```

`complexity-found` means at least one reported area, regardless of cause;
`no-material-complexity` means a completed assessment found no reportable area;
`no-change` means change-target resolution found no diff. The top-level estimate
covers all reported areas within the target and deduplicates overlaps.

The report normally stays within 350 words and conforms to the repository's
Markdown lint rules. It favors fewer, broader areas and one short paragraph per
area. Causal accuracy may exceed the word limit. It presents
contract-caused areas before implementation-caused areas and orders each
group by complexity, then estimated cost. It omits progress, next steps,
verification results, exhaustive code inventories, and change narration.
