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
[testing policy's handoff verification](../../../dev/testing.md#verification-lifecycle). A commit range proceeds directly to reviews.

## Reviews

The verifier starts independent fresh Codex and Claude reviews against
the resolved change scope. Their identities remain distinct in the result, and
one review never interrupts the other. Each provider returns one consolidated
final report containing all completed delegated review work, so a later
lifecycle notification cannot replace that evidence.

Each review inspects the complete resolved scope, repository guidance, Git
context, and referenced files. **Empirical.** The verifier tells reviewers that
repository verification is handled separately, to neither run nor manually
reproduce repository tests or checks, to pass the constraint to delegated
reviewers, and to report any needed runtime check and why without running it.
Validation confirms from reviewer commands that neither reviewer ran nor
manually reproduced a repository check, because forwarded guidance alone does
not establish compliance. **Empirical.**

A review is `completed` when its invocation and empirical command validation
succeed and its final report establishes inspection of the complete selected
scope without an unresolved material gap. The verifier includes that report in its
[report](../protocol.md#reports). It marks a missing reviewer `unavailable`; an
unsuccessful invocation, failed or unavailable empirical command validation,
missing usable final report, or incomplete inspection is `failed`. The verifier
re-reports `unavailable` and `failed` as [concerns](../protocol.md#concerns)
with their failure evidence.

## Findings

The verifier treats every concrete candidate finding in each final review
report as evidence to validate and deduplicates equivalent candidates before
reporting them. A report's correction or withdrawal contributes evidence to
the candidate's disposition rather than deciding it. When conflicting reports
cannot be resolved from the repository and accepted intent, the finding is
`unresolved`.

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
alone change `clean` to `findings`. Every non-rejected finding also appears in `concerns`.

A stopped result includes the failed phase's evidence. Reviews blocked by an
earlier phase are omitted, not `unavailable`.

The verifier's result uses the shared [result fields](../protocol.md#results)
and the [`ChangeScopeResult`](../change-scope.md#result-type) type in this
complete shape:

```yaml
outcome: <clean | findings | no-change | stopped>
reason: <condition that stopped verification> # if stopped
decisions: <Decision[]> # if any
concerns: <Concern[]> # if any
scope: <ChangeScopeResult>
degraded: true # if degraded
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
