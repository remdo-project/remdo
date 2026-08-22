# remdo-converge-change

This skill owns simplification, cleanup, verification, and evidence-supported
correction for one repository change. It returns an [agent result](../protocol.md#results). One
[change scope](../change-scope.md) bounds the run; the skill does not select or expand intended behavior.

## Authority

[Repository authority](../../../../AGENTS.md#repository-authority): the skill
leaves `uncommitted` corrections unstaged and uncommitted. For a commit range,
it treats a correction as inapplicable when `HEAD` is detached. On an attached
branch, it stages only each validated coherent correction batch and creates one
normal nonempty commit for that batch.

## Convergence

1. Resolve the change scope. Immediately report its
   [caller-visible display](../change-scope.md#caller-visible-display) as a
   short, standalone `Scope:` line without other progress. If the selected
   diff is empty, then return `converged`. If the scope is a commit range,
   then retain `BASE` while correction commits advance `HEAD` and assess
   `BASE..HEAD` in every later quality step.
2. Run one or more independent simplification assessments that collectively
   cover the resolved change once. Give each only its target and applicable
   authoritative contracts, and collect every result before editing. Apply
   the shared
   [decision rule](../../../../AGENTS.md#execution-and-evidence) to options
   in completed results and retain any
   [decisions](../protocol.md#decisions). If the rule does not permit an
   autonomous choice, then leave that option unapplied and retain it as a
   [concern](../protocol.md#concerns). If the findings or resolved options
   determine behavior-preserving corrections, then run
   [Correct the state](#correct-the-state).
3. Repeat the following quality steps:
   1. If the scope contains code or tests, then run the cleanup audit.
      Otherwise, record cleanup as `not-run`.
   2. If the audit determines corrections, then run
      [Correct the state](#correct-the-state) and restart these quality
      steps.
   3. Invoke [`remdo-verify-change`](remdo-verify-change.md), preserve its
      finding dispositions, and leave `material out of scope` findings
      unchanged.
   4. If failed checks or
      [`confirmed` findings](remdo-verify-change.md#findings) determine
      corrections, then run [Correct the state](#correct-the-state) and
      restart these quality steps.
   5. Return `converged`.

### Correct the state

Run this subalgorithm for each determined correction batch. Any outcome it
returns ends convergence. Ordinary completion returns to the invoking step
with the refreshed scope.

1. If the determined correction cannot be applied, then leave it unapplied
   and return `not-converged`.
2. Apply the batch.
3. Validate it against its applicable authoritative contracts. If the scope
   is a commit range, then satisfy the contributor
   [verification lifecycle](../../../dev/testing.md#verification-lifecycle)
   before committing.
4. If validation or a check fails and an in-scope correction can be
   determined, then repair the batch and repeat validation.
5. If validation or a check still fails, then return `stopped` without
   committing.
6. Persist the batch under [Authority](#authority), then refresh the same
   retained scope.
7. If the selected diff is empty, then return `converged`.
8. If the refreshed state matches a repository state reached earlier in the
   run, then return `stopped` with a concern.

Unhandled failures follow the
[capability protocol](../protocol.md#results).

## Result

`findings` carries every verifier disposition across iterations and marks each
confirmed finding as fixed or uncorrected. `verification.findings` is the
latest iteration only. `simplification`, `cleanup`, and `verification` contain
the complete latest results for the state they assessed.

The result uses the shared [result fields](../protocol.md#results) and the
[`ChangeScopeResult`](../change-scope.md#result-type) type:

```yaml
outcome: <converged | not-converged | stopped>
reason: <condition that prevented or stopped convergence> # if not converged or stopped
decisions: <Decision[]> # if any
concerns: <Concern[]> # if any
scope: <ChangeScopeResult>
corrections: # if any
  - source: <simplification | cleanup | verification>
    summary: <applied correction>
simplification: # if run
  - source: <assessment capability or participant>
    result: <complete result>
cleanup: # if evaluated
  command: <command>
  status: <passed | failed | not-run>
  details: <failure evidence or reason not run> # if failed or not-run
verification: <complete latest remdo-verify-change result> # if run
findings: # if any
  - summary: <finding>
    source: <codex | claude>
    disposition: <confirmed | rejected | unresolved | material out of scope>
    reason: <disposition reason>
    resolution: <fixed | uncorrected> # if confirmed
```

`not-converged` means a completed quality step left a determined correction unapplied.
