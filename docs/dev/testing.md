# Testing

RemDo's contributor testing policy defines the evidence that makes a change
reviewable. The [test harness](../specs/testing/test-harness.md) separately owns
test-runtime lifecycle, isolation, and diagnostics.

## Coverage

Each test must fail for a credible regression in one behavior relied on by a
user or component. A test may assert several observable effects of that
behavior. It exercises the responsible logic or integration boundary with an
expectation independent of the implementation under test. Repeating a
declaration or implementation structure, deriving the expected value from the
implementation under test, or duplicating existing coverage, does not count.

A reader can identify the behavior, the inputs that matter, and the expected
result without following the implementation under test or helpers or
replacements that hide those facts.

A test produces the same result on every run for the same code and fixture,
independently of other tests and of wall-clock time.

Review covers each changed behavior with an automated test meeting this policy
or an [empirical check](#empirical-checks) classified by the
behavior's current owner. This is behavior coverage, not a line-coverage target.

## Dependencies

Use a real dependency of the code under test when it is fast and deterministic.
When it is not, use a simpler implementation that preserves that dependency's
contract. Supply a canned response only as a precondition of the behavior under
test. Assert resulting state. Assert that a dependency was called only when
that call is the behavior under test.

## Automated test selection

Use the narrowest [automated test level](../specs/testing/test-harness.md) that
still exercises the behavior at the boundary where it occurs. When a unit test
is a poor fit, use an integration or end-to-end test rather than an over-complex
unit test, a unit test a reader can understand only by replaying replacements,
or a manual check. Manual and live checks are development aids, not
substitutes for automated coverage.

## Verification lifecycle

Before each commit or uncommitted handoff, run likely affected tests and
applicable static checks.

Local test selection intentionally optimizes feedback time rather than
completeness. Also run explicitly selected tests for known relationships it
cannot discover. CI runs complete repository verification and must pass before integration.

Pass test paths directly, as `pnpm run test:unit <path>...`; a scoped run costs
seconds where the whole suite costs minutes.

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
- [Software Engineering at Google: Test Doubles](https://abseil.io/resources/swe-book/html/ch13.html)
  — real dependencies and contract-preserving fakes over stubs; state over
  interaction.
- [Pact: Writing consumer tests](https://docs.pact.io/consumer)
  — guarantees selected by actual consumer reliance and consumer-breaking risk.
- [Google Research: Practical Mutation Testing at Scale](https://research.google/pubs/practical-mutation-testing-at-scale-a-view-from-google/)
  — test efficacy measured by detecting credible seeded faults rather than code
  execution alone.
