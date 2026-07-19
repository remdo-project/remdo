# remdo-verify-change

`remdo-verify-change` verifies one explicit scope. It reports evidence and
findings without changing repository state, approving the scope, or controlling
its lifecycle.

## Scope

The caller explicitly selects one scope: the working tree or an explicit Git
diff range ending at `HEAD`, `<left>..HEAD` or `<left>...HEAD`. Working-tree
scope includes staged, unstaged, and untracked files not excluded by Git's
standard ignore rules. A two-dot range requires `left` to be an ancestor of
`HEAD`; divergent histories must be passed as a three-dot range. A range
resolves once to immutable commits, uses Git's diff semantics, and requires a
clean working tree. A missing, empty, invalid, or mixed scope stops before
verification.

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
changes or exact resolved range and operate read-only under repository rules.
An unavailable or failed review is reported and does not abort the other
review. A review that cannot inspect its full scope has failed. Normal
verification exposes each complete final reviewer report without intermediate
execution; intermediate execution is diagnostic evidence for failed reviews or
intentional debugging.

## Adapter validation

When a reviewer adapter is added or changed, test it end to end for every
supported scope. Prove that it invokes native review, inspects the complete
scope, returns the complete final report without intermediate output, and
operates read-only during startup and review in end-to-end tests. The adapter
accepts only output carrying explicit review-completion evidence. Use a
permission configuration proven to support complete review without silent
degradation. Any failed proof fails validation.

## Result

The result reports the scope, check outcomes, and each reviewer's output,
unavailability, or failure. It is clean when checks pass and no findings are
reported; reviewer unavailability or failure alone does not make it non-clean.
The result is evidence, not approval.

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
