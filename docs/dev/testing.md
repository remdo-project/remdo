# Testing

RemDo's contributor testing policy defines the evidence that makes a change
reviewable. The [test harness](../specs/testing/test-harness.md) separately owns
test-runtime lifecycle, isolation, and diagnostics.

## Coverage

Each test must fail for a credible regression in behavior relied on by a user or
component. It exercises the responsible logic or integration boundary with an
expectation independent of the implementation under test. Repeating a
declaration or implementation structure, or duplicating existing coverage,
does not count.

Review covers each changed behavior with an automated test meeting this policy
or an [empirical check](#empirical-checks) classified by the
behavior's current owner. This is behavior coverage, not a line-coverage target.

## Automated test selection

Use the narrowest [automated test level](../specs/testing/test-harness.md) that
still exercises the behavior at the boundary where it occurs. When a unit test
is a poor fit, use an integration or end-to-end test rather than an over-complex
unit test or a manual check. Manual and live checks are development aids, not
substitutes for automated coverage.

## Empirical checks

Use an empirical check only when authoritative dependency contracts and
repository-owned automated tests cannot establish implementation conformance
with a meaningful machine-checkable result, a reliable signal, and acceptable
cost at a defined lifecycle point.

An empirical check has no committed executable, scenario, or evidence artifact.
When behavior becomes suitable for automated coverage, that coverage replaces
its empirical classification.

The behavior's current owner appends **Empirical.** to each clause it classifies
for empirical checking. The marker identifies the behavior requiring
confirmation, not a check procedure or evidence artifact. Keep a brief rationale
beside it when the behavior is not derivable from its dependency contracts, so
that a later reader does not retire the check by reasoning from those contracts
alone.

## Fixture assumptions

Tests may rely on their declared fixture shape. Do not add guards or assertions
that only revalidate that setup; use a non-null assertion when TypeScript cannot
infer that a fixture value exists.

## References

- [Software Engineering at Google: Unit Testing](https://abseil.io/resources/swe-book/html/ch12.html)
  — behavior through public APIs, independent outcomes, and resilience to
  behavior-preserving implementation changes.
- [Pact: Writing consumer tests](https://docs.pact.io/consumer)
  — guarantees selected by actual consumer reliance and consumer-breaking risk.
- [Google Research: Practical Mutation Testing at Scale](https://research.google/pubs/practical-mutation-testing-at-scale-a-view-from-google/)
  — test efficacy measured by detecting credible seeded faults rather than code
  execution alone.
