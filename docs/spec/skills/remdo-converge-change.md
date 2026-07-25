# remdo-converge-change

This skill advances one explicitly selected [`remdo-verify-change` review
scope](remdo-verify-change.md#scope) by applying validated corrections and
re-verifying until the current repository state converges. It does not select or
expand intended behavior.

## Convergence

The skill invokes [`remdo-verify-change`](remdo-verify-change.md) against the
current state. It validates each reported failure and finding, fixes those it
confirms and can correct, rejects those it determines invalid with reasons, and
reports the rest as unresolved.

For `working-tree`, corrections remain uncommitted. For `committed-range`, the
resolved `BASE` remains fixed and the skill commits corrections before running
verification again.

After applying all determined corrections from one verification, the skill runs
complete verification again. It does not re-verify unchanged state and continues
using available evidence when [verification is degraded](remdo-verify-change.md#result).

A `clean` or `findings` verification is converged when no determined correction
remains to apply, including when findings remain unresolved or verification is
degraded.

A re-verification stopped because corrections emptied the retained scope is
also converged.

## Result

The result reports whether the state converged, the scope, corrections applied,
rejected findings and their reasons, unresolved findings, the latest
verification result, and any condition that prevented convergence.

## Future

- Add a simplification step and its `audit:cleanup` backstop once the step's
  scope and ownership are specified.
