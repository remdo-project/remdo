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

The verifier runs applicable deterministic repository checks in place. Any
failure is reported and stops verification before reviewer calls.

After all checks pass, the verifier invokes fresh, independent Codex and Claude
native review surfaces in parallel through the shared
[read-only agent runner](../agents/tools/read-only-runner.md). The verifier owns
scope construction, review instructions, Claude's temporary synthetic upstream,
review-completion meaning, and findings. The runner owns fresh provider
sessions, safety boundaries, cancellation, protocol completion, and
final-response extraction. A runner response is necessary but not sufficient
for a completed review.

Reviewers inspect the selected working-tree changes or exact resolved range
under repository rules. Codex uses its provider-owned read-only sandbox with
approval fixed to `never`. Claude is trusted to honor the runner-owned read-only
instruction because its native review requires tool execution; its permissions
are not a security boundary. Claude reviews run at medium effort.
An unavailable or failed review is reported and does not abort the other
review. A review that cannot inspect its full scope has failed. Normal
verification exposes each complete final reviewer report without intermediate
provider output. Provider execution failures expose only the runner's failure
classification; a completed final response remains available for verifier
interpretation.

Reviewer runtime is unspecified and neither silence nor elapsed time is failure
evidence. Monitor each managed parallel call through its completion notification
instead of polling it. Cancel a review only when the caller or enclosing
lifecycle explicitly abandons it; cancellation is reported as a failed review.

## Adapter validation

The verifier's shell entry points are thin fronts over provider-specific runner
requests. Codex selects native working-tree or base review and returns its
provider's text-only final report as response content. The executing verifier,
not a fixed phrase matcher, determines whether that report represents a review
of the full scope; an inability or unresolved ambiguity about full-scope
inspection is failed and the report is failure evidence. Claude selects
`/code-review`, supplies the exact resolved range when present, and accepts only
schema-valid output with `review_complete: true` and a non-empty complete
report. A missing declared native command is unavailable; other runner failures
remain failed.

When a reviewer request builder is added or changed, test it end to end for
every supported scope. Prove that it invokes native review, inspects the
complete scope, returns the complete final report without intermediate output,
and does not mutate the repository during review. Codex validation includes its
provider-owned read-only sandbox and text completion channel. Claude validation
includes its fixed cooperative profile, explicit review-completion field, and
synthetic upstream for branches both with and without configured merge refs.
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
means scope resolution or checks prevented reviews. Add `degraded` when an
attempted reviewer was unavailable or failed; neither condition alone changes
`clean` to `findings`.

Report only evidence relevant to a failure, not successful sub-results of the
same failed step. Reviews intentionally not attempted are `not run`, not
`unavailable`. The result is evidence, not approval.
