# remdo-verify-change

`remdo-verify-change` verifies one review scope selected explicitly by its
caller. It reports evidence and findings without changing repository state,
approving the review scope, or controlling its lifecycle.

## Scope

A **review scope** is the repository state to verify. The caller selects exactly
one:

- `working-tree` (`working-tree` input): all staged and unstaged changes plus
  untracked files not excluded by Git's standard ignore rules, relative to the
  resolved `HEAD` on an attached branch.
- `committed-range` (`<left>..HEAD` or `<left>...HEAD` input): the exact
  `BASE..HEAD` diff between resolved immutable commits; the working tree must be
  clean. With two dots, `left` must be an ancestor of `HEAD` and becomes `BASE`.
  With three dots, their merge base becomes `BASE`.

When invoked interactively, the verifier maps an unambiguous description of the
intended scope to one of these inputs; otherwise it asks the caller to clarify.

Verification stops when the input is missing, empty, or invalid, or when a
range is combined with working-tree changes.

The caller keeps the review scope unchanged until verification finishes.

## Verification

```text
[review scope]
    │
    v
[deterministic checks]
    ├─ failure ─> [report and stop]
    │
    └─ pass
        ├─> [Codex review] ──┐
        └─> [Claude review] ─┴─> [report]
```

The verifier runs applicable deterministic repository checks in place.

## Reviews

The verifier resolves the selected review scope and constructs the
instructions. It invokes independent Codex and Claude reviews through the shared
[read-only agent runner](../agents/tools/read-only-runner.md) and interprets
their completion and findings.

Reviewers inspect the complete review scope under repository rules and the
[runner's repository protection](../agents/tools/read-only-runner.md#repository-protection).
The verifier maps the runner's [result](../agents/tools/read-only-runner.md#result)
to each review status; only a response is eligible for verifier interpretation.
An unavailable or failed review is reported and does not abort the other review.
A review that cannot inspect its complete review scope has failed. Each
completed review exposes its complete final report without intermediate
provider output.

The verifier follows the runner's
[lifecycle](../agents/tools/read-only-runner.md#lifecycle), awaits each managed
call's completion notification, and cancels a review only when the caller or
enclosing lifecycle explicitly abandons it. Cancellation is reported as a
failed review.

**Codex.** Codex selects native `working-tree` or `committed-range` review. The
executing verifier, not a fixed phrase matcher, determines whether that report
represents a review of the complete review scope. If inspection of the complete
review scope is impossible or remains ambiguous, the review has failed and the
report is failure evidence.

**Claude.** Claude selects native review, supplies the exact `committed-range`
review scope when selected, and accepts only schema-valid output with
`review_complete: true` and a non-empty complete report. For a `working-tree`
review scope, Claude sees the current branch as its own upstream only during the
review, excluding committed branch history without changing repository
configuration. Claude reviews run at medium effort.

## Adapter validation

The verifier's shell entry points are thin fronts over provider-specific runner
requests.

Every added or changed reviewer request builder has end-to-end validation for
every supported review scope kind. The validation proves that it invokes native
review, inspects the complete review scope, returns the complete final report
without intermediate output, and does not mutate the repository during review.

**Codex.** Validation includes its provider-owned read-only sandbox and text
completion channel.

**Claude.** Validation includes the runner's cooperative repository protection,
the explicit review-completion field, and `working-tree` review scopes on
branches both with and without pre-existing upstream configuration.

Any missing proof or silent safety degradation fails validation.

## Result

The result follows this order:

```text
Verification: <clean | findings | stopped> [(degraded)]

Scope
<requested and resolved review scope, or resolution failure>

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
```

`clean` means checks passed and completed reviewers reported no findings;
`findings` means at least one completed reviewer reported findings. `stopped`
means review scope resolution or checks prevented reviews. `degraded`
accompanies the status when an attempted reviewer was unavailable or failed;
neither condition alone changes `clean` to `findings`.

A failed step reports only evidence relevant to its failure, not its successful
sub-results. Reviews intentionally not attempted are `not run`, not
`unavailable`.
