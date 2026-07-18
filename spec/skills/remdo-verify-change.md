# remdo-verify-change

`remdo-verify-change` verifies one explicit scope. It reports evidence and
findings without changing repository state, approving the scope, or controlling
its lifecycle.

## Scope

The caller explicitly selects one scope: the working tree or a Git range ending
at `HEAD`. Working-tree scope includes staged, unstaged, and untracked files not
excluded by Git's standard ignore rules. Range scope resolves to immutable
commits and requires a clean working tree. A missing, empty, invalid, or mixed
scope stops before verification.

Checks and reviewers inspect the same unchanged scope.

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

The verifier runs applicable deterministic repository checks first. Any failure
is reported and stops verification before reviewer calls.

After all checks pass, the verifier requests fresh, independent Codex and
Claude reviews in parallel, passing the explicit scope and requiring read-only
operation under repository rules. A reviewer failure does not abort the other
review.

## Result

The result reports the scope, check outcomes, and each reviewer's output,
unavailability, or failure. It is clean when checks pass and no findings are
reported; reviewer unavailability or failure alone does not make it non-clean.
The result is evidence, not approval.

## Future

- TODO: Research explicit specification- and implementation-readiness modes
  only if standalone and change-flow use exposes recurring ambiguity that
  reviewer inference cannot resolve reliably.

- TODO: Consider running the verifier as a fresh subagent, created either by
  its caller or by the verifier itself, if evidence from real runs shows that
  doing so is more efficient.
