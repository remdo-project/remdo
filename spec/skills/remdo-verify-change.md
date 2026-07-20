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
native review surfaces in parallel. Reviewers inspect the selected working-tree
changes or exact resolved range under repository rules. Codex uses an enforced
read-only sandbox. Claude is trusted to honor read-only instructions because
its native review requires tool execution; its permissions are not a security
boundary.
Claude reviews run at medium effort.
An unavailable or failed review is reported and does not abort the other
review. A review that cannot inspect its full scope has failed. Normal
verification exposes each complete final reviewer report without intermediate
execution; intermediate execution is diagnostic evidence for failed reviews or
intentional debugging.

## Adapter validation

When a reviewer adapter is added or changed, test it end to end for every
supported scope. Prove that it invokes native review, inspects the complete
scope, returns the complete final report without intermediate output, and
does not mutate the repository during startup or an end-to-end review. The
adapter accepts only output carrying explicit review-completion evidence. Use
a permission configuration proven to support complete review without silent
degradation. Claude validation proves cooperative reviewer behavior, not
adversarial containment. Any failed proof fails validation.

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

## Future

- TODO: Decide whether deterministic checks belong in this skill at all.

- TODO: Decide whether deterministic checks and their selection rules belong in
  this specification or in the skill contract.

- TODO: Research explicit specification- and implementation-readiness modes
  only if standalone and change-flow use exposes recurring ambiguity that
  reviewer inference cannot resolve reliably.

- TODO: Consider running the verifier as a fresh subagent, created either by
  its caller or by the verifier itself, if evidence from real runs shows that
  doing so is more efficient.
