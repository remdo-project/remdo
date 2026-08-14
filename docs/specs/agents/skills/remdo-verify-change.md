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
    ├─ failure ───────────> [report and stop]
    │ ready
    v
[focused checks if uncommitted]
    ├─ failure ───────────> [report and stop]
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

For uncommitted work, the verifier performs the contributor
[testing policy's handoff verification](../../../dev/testing.md#verification-lifecycle).
A commit range proceeds directly to reviews.

## Reviews

The verifier invokes the [read-only runner](../tools/read-only-runner.md#call) independently for Codex and
Claude with the resolved change scope. Their identities remain distinct in the
result.

Review [results](../tools/read-only-runner.md#result) are independent; one never
interrupts another. The verifier re-reports `unavailable` and `failed` as
[concerns](../protocol.md#concerns). For `responded`, it reads every response in
the review evidence and includes that evidence in its [report](../protocol.md#reports).
It maps the review to `completed` only when the evidence collectively
establishes inspection of the full selected scope without leaving a material
inspection gap unresolved and the evidence has `complete: true`. Earlier
lifecycle notifications do not make a review failed when later evidence
resolves them. `complete: false` always makes the review failed, but its response
texts remain candidate-finding evidence. Otherwise, the verifier marks the
review `failed` and uses the review evidence as failure evidence.

## Findings

The verifier treats every concrete candidate finding in every review response
as evidence to validate, even when another response omits, summarizes, refutes,
or withdraws it. It deduplicates equivalent candidates before reporting them. A
response containing only lifecycle status contributes no candidate finding; a
correction or withdrawal
contributes evidence to the candidate's disposition rather than deciding it.
When conflicting responses cannot be resolved from the repository and accepted
intent, the finding is `unresolved`.

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

`clean` means every local check required for the scope passed, finding validation
completed, and it produced only `rejected` dispositions or no findings.
`findings` means completed validation produced a `confirmed`, `unresolved`, or
`material out of scope` disposition. `no-change` means scope resolution found no
diff, so checks and reviews were not run. An unavailable or failed reviewer sets
`degraded: true` and appears in `concerns`, but does not stop verification or
alone change `clean` to `findings`. Every non-rejected finding also appears in
`concerns`.

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
    details: <review evidence or failure evidence>
findings: # if any
  - summary: <finding>
    source: <codex | claude>
    disposition: <confirmed | rejected | unresolved | material out of scope>
    reason: <disposition reason>
```
