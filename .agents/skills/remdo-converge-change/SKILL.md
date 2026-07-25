---
name: remdo-converge-change
description: Converge one explicitly selected RemDo working-tree or Git-range scope by invoking remdo-verify-change, correcting confirmed issues, and re-verifying only changed repository states. Use only when the caller explicitly invokes $remdo-converge-change with exactly one scope.
---

# RemDo Converge Change

Advance one explicit scope under the authoritative
[`remdo-converge-change`](../../../docs/spec/skills/remdo-converge-change.md)
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

1. Wait for verification to finish.
2. Collect every failed check and
   [`confirmed` finding](../../../docs/spec/skills/remdo-verify-change.md#findings)
   you can correct into one complete correction batch. Preserve the verifier's
   finding dispositions and record confirmed findings that cannot be corrected.
3. Apply the complete correction batch only after verification has finished.
   Keep working-tree corrections uncommitted. In committed-range scope, make one
   coherent correction commit before running verification again.
4. Run the complete verifier again only when the repository state changed. Use
   the retained scope, and repeat.

Do not amend, create an empty commit, or push.

Determine convergence under the authoritative specification's
[Convergence](../../../docs/spec/skills/remdo-converge-change.md#convergence)
contract.

## Commit authority

Committed-range invocation declares autonomous authority to stage and commit
the correction batches produced by this run on the current branch. This
authority covers only those corrections and does not authorize pushing.

Working-tree invocation does not authorize commits.

## Report

Return the result defined by the authoritative specification's
[Result](../../../docs/spec/skills/remdo-converge-change.md#result) section.

## References

- [Convergence contract](../../../docs/spec/skills/remdo-converge-change.md)
- [Verification contract](../../../docs/spec/skills/remdo-verify-change.md)
- [Agent guidelines](../../../AGENTS.md)
