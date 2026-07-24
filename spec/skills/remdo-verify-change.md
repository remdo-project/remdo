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

The verifier invokes the [read-only
runner](../agents/tools/read-only-runner.md#call) independently for Codex and
Claude with a `review` invocation, the resolved review scope, and `high` effort.

Review [results](../agents/tools/read-only-runner.md#result) are independent:
one never interrupts another. The verifier reports `unavailable` and `failed`
directly. It treats `responded` as `completed`, includes the complete report,
and interprets its findings unless the report indicates that inspection of the
complete review scope failed or remains uncertain; then it treats the review as
`failed` and uses the report as evidence.

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
