# spec-complexity

This read-only skill returns an [agent result](../protocol.md#results) showing
which accepted-behavior decisions create material implementation complexity
within one [assessment target](../assessment-target.md), what simpler alternatives
exist, and what target complexity those decisions do not require. It does not
select or apply an alternative.

## Target

The assessment and its estimates are target-bounded. For a change target, it
includes the changed end state and directly related mechanisms while excluding
unrelated pre-existing complexity. For a subject target, it includes the named
current-tree subject, its implementation, and tests.

## Assessment

The [report](../protocol.md#reports) answers:

> Which accepted-behavior decisions create complexity within the target, and
> what simpler alternatives exist?

The skill assesses the target against its applicable current
[contract owners](../../../documentation.md#ownership), implementation, tests,
and Git history. Use history to distinguish contract-driven cost from incidental
implementation choices. Follow linked owners before classifying complexity as unrequired.

For each area caused by an accepted-behavior decision, report the decision,
resulting implementation mechanism, contract owner, separate implementation
and test estimates, simpler behavioral alternative, and main tradeoff.

Classify areas as `high` when they dominate implementation or test complexity,
`medium` when they remain substantial but contained, and `low` when they do not
materially drive the design. Report `low` areas only when the caller requests
them. Classifications are directional; estimates may overlap. Causal
attribution matters more than precision: ranges need only show relative cost,
but repository evidence must connect each mechanism to its assigned
accepted-behavior decision.

The report also identifies substantial target complexity not required by the
applicable contracts.

It remains a complexity assessment rather than a correctness review or general
implementation-preserving refactor proposal.

## Result

The result uses this complete shape with the shared
[`Concern`](../protocol.md#concerns) and
[`AssessmentTarget`](../assessment-target.md#result-type) types:

```yaml
outcome: <complexity-found | no-material-complexity | no-change | stopped>
reason: <condition that prevented assessment> # if stopped
concerns: <Concern[]> # if any
target: <AssessmentTarget> # if resolved
estimated_cost: # if complexity-found
  implementation: <line range>
  tests: <line range>
areas: # if complexity-found
  - name: <area>
    cause: <accepted-behavior | implementation>
    contract_owner: <path> # if cause is accepted-behavior
    complexity: <high | medium | low>
    estimated_cost:
      implementation: <line range>
      tests: <line range>
    estimate_note: <qualification or overlap> # if needed
    assessment: <accepted-behavior decision and mechanism or unrequired mechanism>
    alternative: <simpler behavior or implementation boundary>
    tradeoff: <behavior lost or delegated> # if cause is accepted-behavior
```

`complexity-found` means at least one reported area, regardless of cause;
`no-material-complexity` means a completed assessment found no reportable area;
`no-change` means change-target resolution found no diff. The top-level estimate
covers all reported areas within the target and deduplicates overlaps.

The report normally stays within 350 words and conforms to the repository's
Markdown lint rules. It favors fewer, broader areas and one short paragraph per
area. Causal accuracy may exceed the word limit. It presents
areas caused by accepted behavior before areas caused by implementation and
orders each group by complexity, then estimated cost. It omits progress, next
steps, verification results, exhaustive code inventories, and change narration.
