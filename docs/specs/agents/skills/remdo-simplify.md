# remdo-simplify

This read-only skill reports concrete code and test simplifications within one
[assessment target](../assessment-target.md) and returns an
[agent result](../protocol.md#results). It neither chooses new accepted
behavior nor applies a change.

## Target

The capability accepts either assessment-target form:

- `change`: the changed end state and directly related implementation and
  tests;
- `subject`: the named current-tree subject, its implementation and tests, and
  direct boundaries that determine its shape.

Documentation and skill prose provide evidence only.

A composed assessment receives only the target and applicable contracts, not
suspected fixes, implementation rationale, or earlier conclusions.

## Findings

A finding is grounded in the target and identifies a concrete,
behavior-preserving end state that remains simpler after all required companion
changes and justifies the churn.

Findings are ordered by expected simplification value:

- `S1`: a design or ownership simplification likely to prevent substantial
  churn;
- `S2`: a clearly worthwhile local code or test simplification;
- `S3`: a concrete, low-risk cleanup.

An option records a real tradeoff without one determined simpler end state and
is not applied automatically.

The assessment excludes style preferences, speculative architecture, and
unrelated cleanup.

## Result

The result uses this shape:

```yaml
outcome: <simplifications-found | no-simplification | no-change | stopped>
concerns: # if any
  - source: <originating capability or participant>
    summary: <condition>
target: <resolved assessment target> # if resolved
findings: # if simplifications-found
  - priority: <S1 | S2 | S3>
    location: <path and line>
    summary: <opportunity>
    simpler_state: <concrete end state>
    basis: <why behavior is preserved and the end state is simpler>
options: # if any
  - location: <path or component>
    summary: <tradeoff>
    alternatives:
      - <alternative with material advantages and costs>
    recommendation: <preferred alternative and evidence> # if supported
reason: <condition that prevented assessment> # if stopped
```

- `simplifications-found`: at least one finding;
- `no-simplification`: a completed assessment found none and may include
  options;
- `no-change`: change-target resolution found no diff;
- `stopped`: target resolution or a required assessment could not complete.

The report presents the target and key evidence, findings by priority, then
options, omitting empty sections.
