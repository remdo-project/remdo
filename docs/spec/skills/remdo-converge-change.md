# remdo-converge-change

This skill verifies a repository change, applies every correction
supported by the evidence, and repeats until no further correction can be
determined. One [change scope](../agents/change-scope.md) bounds the run; the
skill does not select or expand intended behavior.

## Convergence

The skill invokes [`remdo-verify-change`](remdo-verify-change.md) against the
current state. It applies every correction it can determine from a failed check
or [`confirmed` finding](remdo-verify-change.md#findings) and carries every
finding disposition into its result. It does not correct `material out of
scope` findings or reinterpret dispositions.

For `uncommitted`, corrections remain uncommitted. For a commit range, the
resolved `BASE` remains fixed and the skill commits corrections before running
verification again. It does not apply commit-range corrections from a detached
`HEAD`.

Before committing or re-verifying, the skill checks the correction batch
against every applicable authoritative contract.

After applying all determined corrections from one verification, the skill runs
complete verification again. It does not re-verify unchanged state and continues
using available evidence when [verification is degraded](remdo-verify-change.md#result).

A `clean`, `findings`, or `no-change` verification is converged when no
`confirmed` finding remains that the skill can correct, including when other
dispositions remain or verification is degraded.

## Result

The result reports whether the state converged, the scope, corrections applied,
the verifier's finding dispositions, confirmed findings it could not correct,
the latest verification result, and any condition that prevented convergence.

## Future

- Add a simplification step and its `audit:cleanup` backstop once the step's
  scope and ownership are specified.
