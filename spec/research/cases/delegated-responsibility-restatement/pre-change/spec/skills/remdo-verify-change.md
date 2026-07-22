# remdo-verify-change

`remdo-verify-change` verifies one explicit scope. It reports evidence and
findings without changing repository state, approving the scope, or controlling
its lifecycle.

## Scope

The caller explicitly selects one scope: the working tree on an attached branch
or an explicit Git diff range ending at `HEAD`, `<left>..HEAD` or
`<left>...HEAD`. Working-tree scope includes staged, unstaged, and untracked
files not excluded by Git's standard ignore rules. A two-dot range requires
`left` to be an ancestor of `HEAD`; divergent histories must be passed as a
three-dot range. A range resolves once to immutable commits, uses Git's diff
semantics, and requires a clean working tree. A missing, empty, invalid, or
mixed scope stops before verification.

The caller keeps the selected scope unchanged until verification finishes.

## Verification

```text
[explicit scope]
    │
    v
[deterministic checks]
    ├─ failure ─> [report and stop]
    │
    └─ pass
        ├─> [fresh Codex review] ──┐
        └─> [fresh Claude review] ─┴─> [report]
```

The verifier runs applicable deterministic repository checks in place.

## Reviews

The verifier invokes fresh, independent Codex and Claude native review surfaces
through the shared
[read-only agent runner](../agents/tools/read-only-runner.md). The verifier owns
scope construction, review instructions, review-completion meaning, and
findings. The runner owns fresh provider sessions, safety boundaries,
cancellation, protocol completion, and final-response extraction. A runner
response is necessary but not sufficient for a completed review.

Reviewers inspect the selected working-tree changes or exact resolved range
under repository rules and the runner's
[repository protection](../agents/tools/read-only-runner.md#repository-protection).
The verifier maps the runner's [result](../agents/tools/read-only-runner.md#result)
to each review status; only a response is eligible for verifier interpretation.
An unavailable or failed review is reported and does not abort the other review.
A review that cannot inspect its full scope has failed. Each completed review
exposes its complete final report without intermediate provider output.

The verifier follows the runner's
[lifecycle](../agents/tools/read-only-runner.md#lifecycle), awaits each managed
call's completion notification, and cancels a review only when the caller or
enclosing lifecycle explicitly abandons it. Cancellation is reported as a
failed review.

**Codex.** Codex selects native working-tree or base review and returns its
provider's text-only final report as response content. The executing verifier,
not a fixed phrase matcher, determines whether that report represents a review
of the full scope; an inability or unresolved ambiguity about full-scope
inspection is failed and the report is failure evidence.

**Claude.** Claude selects review, supplies the exact resolved range when
present, and accepts only schema-valid output with `review_complete: true` and a
non-empty complete report. The runner maps review to `/code-review`; a missing
review capability is unavailable, while other runner failures remain failed.
For working-tree scope, Claude sees the current branch as its own upstream only
during the review, excluding committed branch history without changing
repository configuration. Claude reviews run at medium effort.

## Adapter validation

The verifier's shell entry points are thin fronts over provider-specific runner
requests.

Every added or changed reviewer request builder has end-to-end validation for
every supported scope. The validation proves that it invokes native review,
inspects the complete scope, returns the complete final report without
intermediate output, and does not mutate the repository during review.

**Codex.** Validation includes its provider-owned read-only sandbox and text
completion channel.

**Claude.** Validation includes the runner's cooperative repository protection,
the explicit review-completion field, and working-tree branches both with and
without pre-existing upstream configuration.

Any missing proof or silent safety degradation fails validation.

## Result

The result follows this order:

```text
Verification: <clean | findings | stopped> [(degraded)]

Scope
<requested and resolved scope, or resolution failure>

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
means scope resolution or checks prevented reviews. `degraded` accompanies the
status when an attempted reviewer was unavailable or failed; neither condition
alone changes `clean` to `findings`.

A failed step reports only evidence relevant to its failure, not its successful
sub-results. Reviews intentionally not attempted are `not run`, not
`unavailable`.
