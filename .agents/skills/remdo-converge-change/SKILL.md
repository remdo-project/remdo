---
name: remdo-converge-change
description: Converge one explicitly selected RemDo working-tree or Git-range scope by invoking remdo-verify-change, validating its evidence, applying confirmed corrections, and re-verifying only changed repository states. Use only when the caller explicitly invokes $remdo-converge-change with exactly one scope.
---

# RemDo Converge Change

Advance one explicit scope under the authoritative
[`remdo-converge-change`](../../../spec/skills/remdo-converge-change.md)
contract. Do not select a default scope or expand intended behavior.

## Fix the scope

Require exactly one caller-supplied `remdo-verify-change` scope. Invoke
`$remdo-verify-change` with the caller's initial input and retain the resolved
scope from its result.

Use that scope for the rest of the run:

- Reinvoke the verifier with `working-tree` for a resolved working-tree scope.
- Reinvoke it with the fixed `<BASE>..HEAD` for a resolved committed range,
  allowing `HEAD` to advance while `BASE` remains immutable.

Stop and report the verifier's scope-resolution failure. Do not infer a scope
from repository state or caller silence.

## Converge the state

For every verifier result:

1. Wait for verification to finish, then validate every reported failure and
   finding against the repository, accepted behavior, and available evidence.
2. Collect every confirmed, correctable issue into one complete correction
   batch. Record invalid findings as rejected with reasons. Record findings that
   remain indeterminate or cannot be corrected as unresolved, and continue
   through all other available evidence.
3. Apply the complete correction batch only after verification has finished.
   Keep working-tree corrections uncommitted. In committed-range scope, make one
   coherent correction commit before running verification again.
4. Run the complete verifier again only when the repository state changed. Use
   the retained scope, and repeat.

Do not amend, create an empty commit, or push.

A `clean` or `findings` result is converged when validation leaves no determined
correction to apply. This includes degraded verification and unresolved
findings. A re-verification stopped because corrections emptied the retained
scope is also converged. Any other `stopped` result without a correction that
can advance repository state is not converged.

## Commit authority

Committed-range invocation declares autonomous authority to stage and commit
the correction batches produced by this run on the current branch. This
authority covers only those corrections and does not authorize pushing.

Working-tree invocation does not authorize commits.

## Report

Report:

- whether the state converged;
- the requested and retained resolved scope;
- all correction batches and commits;
- rejected findings and their reasons;
- remaining unresolved findings;
- the latest verifier result; and
- any condition that prevented convergence.

## References

- [Convergence contract](../../../spec/skills/remdo-converge-change.md)
- [Verification contract](../../../spec/skills/remdo-verify-change.md)
- [Agent guidelines](../../../AGENTS.md)
