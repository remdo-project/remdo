# remdo-verify-change

The skill verifies one [change scope](../change-scope.md) and returns an
[agent result](../protocol.md#results). It reports evidence and findings without
changing repository state, approving the scope, or controlling its lifecycle.

The verifier resolves its optional input under the change-scope contract. It
maps an unambiguous description to a supported input and asks only when the
description is ambiguous. The caller keeps a resolved non-empty scope unchanged
until verification finishes.

## Verification

```text
[change-scope resolution]
    ├─ no-change ─────────> [report]
    │ ready
    v
[deterministic checks]
    │ pass
    v
[independent Codex + Claude reviews]
    │
    v
[finding validation]
    │
    v
[report]
```

The verifier runs the [repository checks prescribed for the agent mode and
scope](../instructions.md#execution-and-verification) in place.

## Reviews

The verifier invokes the [read-only runner](../tools/read-only-runner.md#call) independently for Codex and
Claude with a `review` invocation and the resolved change scope. Their
identities remain distinct in the result.
For Claude, the verifier exercises the caller judgement required by the runner's
[trusted-prompt level](../tools/read-only-runner.md#trusted-prompt): it
judges the runner-constructed vendor-owned native review command and its
resolved-scope arguments to satisfy that level.

Review [results](../tools/read-only-runner.md#result) are independent; one never
interrupts another. The verifier re-reports `unavailable` and `failed` as
[concerns](../protocol.md#concerns). It maps `responded` to `completed`, includes
the complete [report](../protocol.md#reports), and interprets its findings. If
the report says complete-scope inspection failed or remains uncertain, the
verifier instead marks the review `failed` and uses the report as evidence.

## Findings

The verifier judges each finding against the actual change, repository
evidence, accepted behavior, and intended behavior established by the caller. A
relocation does not make unchanged file content part of the change, but its
effects on content preservation, ownership, and links remain subject to review.

Reviewer disagreement alone does not invalidate intended behavior established
by the caller. When caller intent resolves an objection, the verifier still
checks that the resulting behavior is represented as [target behavior](../../../documentation.md#target-behavior) by its current
contract owner, including a brief [rationale](../../../documentation.md#minimality) only when its omission would
reopen the decision. Implementation and test choices that establish no durable
behavior require no documentation.

Each finding has one disposition:

- `confirmed`: evidence supports the finding within the selected scope;
- `rejected`: the finding is refuted, or it is immaterial and outside the
  selected scope;
- `unresolved`: available evidence cannot determine the finding; or
- `material out of scope`: evidence supports the finding outside the selected
  scope and it could materially affect the caller's decision.

The result includes the reason for each disposition. Verification does not
expand the selected scope or decide what happens next. A `confirmed`,
`unresolved`, or `material out of scope` finding remains a concern for the
caller; a `rejected` finding is resolved.

## Result

`clean` means checks passed, finding validation completed, and it produced only
`rejected` dispositions or no findings. `findings` means completed validation
produced a `confirmed`, `unresolved`, or `material out of scope` disposition.
`no-change` means scope resolution found no diff, so checks and reviews were not
run. An unavailable or failed reviewer sets `degraded: true` and appears in
`concerns`, but does not stop verification or alone change `clean` to `findings`.
Every non-rejected finding also appears in `concerns`.

A stopped result includes the failed phase's evidence. Reviews blocked by an
earlier phase are omitted, not `unavailable`.

The verifier's result uses this shape:

```yaml
outcome: <clean | findings | no-change | stopped>
concerns: # if any
  - source: <originating capability or participant>
    summary: <condition>
degraded: true # if degraded
scope: <requested and resolved scope, no-change, or resolution failure>
reason: <condition that stopped verification> # if stopped
checks: # if run
  - command: <command>
    status: <passed | failed | not-run>
    details: <failure evidence or reason not run> # if failed or not-run
reviews: # if run
  - source: <codex | claude>
    status: <completed | unavailable | failed>
    details: <complete report or failure evidence>
findings: # if any
  - summary: <finding>
    source: <codex | claude>
    disposition: <confirmed | rejected | unresolved | material out of scope>
    reason: <disposition reason>
```
