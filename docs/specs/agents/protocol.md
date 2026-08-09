# Capability protocol

Capabilities exchange structured calls and results. The capability addressing
a human renders its result as a report. Each capability owns its call fields,
outcomes, and result fields.

## Calls

Before invocation, a caller establishes the required guarantees, holds the
declared authority, and passes the capability's call as literal YAML:

```yaml
guarantees:
  <capability-owned guarantees>
authority:
  <capability-owned authority>
```

Each capability contract defines its exact call and rejection result. The
capability validates the declaration, trusts its guarantees rather than
re-establishing them, and rejects it before mutation when a required field is
absent or incompatible.

## Results

A capability returning to a caller returns literal YAML beginning with:

```yaml
outcome: <capability-owned outcome>
concerns: # if any
  - source: <originating capability or participant>
    summary: <condition>
# capability-specific fields
```

Capability contracts define additional fields that add detail without replacing
`concerns`. In examples, `# if ...` marks a conditional field. Results explain
omitted work when its absence affects the caller's interpretation. A capability
addressing a human renders the result as its report instead of also returning
the YAML.

## Concerns

A **concern** is a reported condition that may affect the caller's result or
decision. The caller's contract determines whether to resolve, omit, aggregate,
re-report, or change flow or outcome.

## Aggregation

A caller preserves unhandled non-success statuses and concerns with their
provenance. It may consolidate them as its contract permits without changing
their meaning.

## Reports

The capability addressing the reader owns its human-readable **report**. The
report aggregates nested results instead of concatenating reports. Result state
determines its categories. It uses stable labels and only needed detail to
present the outcome, applicable scope, work and evidence, concerns, and next
owner or action in that order.
