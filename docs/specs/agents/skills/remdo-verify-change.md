# remdo-verify-change

The skill verifies one [change
scope](../change-scope.md). It reports evidence and findings without
changing repository state, approving the scope, or controlling its lifecycle.

The verifier resolves its optional input under the change-scope contract. It
maps an unambiguous description to a supported input and asks only when the
description is ambiguous. The caller keeps a resolved non-empty scope unchanged
until verification finishes.

## Verification

```text
[change-scope resolution]
    ├─ no-change ─> [report]
    ├─ failure ───> [report and stop]
    └─ ready
         │
         v
    [deterministic checks]
         ├─ failure ─> [report and stop]
         │
         └─ pass
              ├─> [Codex review] ──┐
              └─> [Claude review] ─┴─> [finding validation] ─> [report]
```

The verifier runs the [repository checks prescribed for the agent mode and
scope](../../../../AGENTS.md#checks) in place.

## Reviews

The verifier invokes the [read-only
runner](../tools/read-only-runner.md#call) independently for Codex and
Claude with a `review` invocation and the resolved change scope. Their
identities remain distinct in the result.
For Claude, the verifier exercises the caller judgement required by the runner's
[trusted-prompt level](../tools/read-only-runner.md#trusted-prompt): it
judges the runner-constructed vendor-owned native review command and its
resolved-scope arguments to satisfy that level.

Review [results](../tools/read-only-runner.md#result) are independent:
one never interrupts another. The verifier reports `unavailable` and `failed`
directly. It treats `responded` as `completed`, includes the complete report,
and interprets its findings unless the report indicates that inspection of the
complete change scope failed or remains uncertain; then it treats the review as
`failed` and uses the report as evidence.

## Findings

The verifier judges each finding against the actual change, repository
evidence, accepted behavior, and intended behavior established by the caller. A
relocation does not make unchanged file content part of the change, but its
effects on content preservation, ownership, and links remain subject to review.

Reviewer disagreement alone does not invalidate intended behavior established
by the caller. When caller intent resolves an objection, the verifier still
checks that the resulting behavior is represented as
[target behavior](../../../documentation.md#target-behavior) by its current
contract owner, including a brief
[rationale](../../../documentation.md#minimality) only when its omission would
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
expand the selected scope or decide what happens next.

## Result

`clean` means checks passed, finding validation completed, and it produced only
`rejected` dispositions or no findings. `findings` means completed validation
produced a `confirmed`, `unresolved`, or `material out of scope` disposition.
`no-change` means scope resolution found no diff, so checks and reviews were not
run. `stopped` means scope resolution, checks, or finding validation prevented
completion. `degraded` accompanies the status when an attempted reviewer was
unavailable or failed; neither condition alone changes `clean` to `findings`.

A failed step reports only evidence relevant to its failure, not its successful
sub-results. Reviews intentionally not attempted are `not run`, not
`unavailable`.

The result follows this order:

```text
Verification: <clean | findings | no-change | stopped> [(degraded)]

Scope
<requested and resolved change scope, no-change, or resolution failure>

Checks
<command>: <passed | failed>
<failure evidence when failed>
or
not run: <reason>

Reviews
not run: <reason>
or
Codex: <completed | unavailable | failed>
<final report or failure evidence>

Claude: <completed | unavailable | failed>
<final report or failure evidence>

Findings
not run: <reason>
or
none
or
<disposition, finding, and reason>
```
