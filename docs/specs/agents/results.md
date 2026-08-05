# Agent results and reports

Capabilities return structured results to callers and render human-readable
reports. Each capability owns its outcomes and fields.

## Results

Results begin with:

```yaml
outcome: <capability-owned outcome>
concerns: # if any
  - source: <originating capability or participant>
    summary: <condition>
# capability-specific fields
```

Capability contracts define additional fields that add detail without replacing
`concerns`. In examples, `# if ...` marks a conditional field. Results explain
omitted work when its absence affects the caller's interpretation.

YAML shapes define capability-to-caller data, not required literal output. A
capability addressing a human renders that result as its report instead of also
printing the YAML shape.

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
