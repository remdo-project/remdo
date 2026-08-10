---
name: remdo-converge-change
description: Converge a default or explicitly selected RemDo uncommitted or Git-range scope through fresh simplification, cleanup, verification, correction, and re-verification. Use only when the caller explicitly invokes $remdo-converge-change.
---

# RemDo Converge Change

Execute the authoritative
[`remdo-converge-change`](../../../docs/specs/agents/skills/remdo-converge-change.md)
contract.

## Resolve the scope

Run the shared resolver from the repository root with the omitted or supplied
[change scope](../../../docs/specs/agents/change-scope.md):

```sh
sh .agents/skills/_shared/tools/resolve-scope.sh [scope]
```

Retain `STATE`, `SCOPE`, `BASE`, `HEAD_SHA`, and the file list. After a
correction, refresh the file list with `uncommitted` or the retained
`<BASE>..HEAD`; never select a new scope.

Use the contract's [Convergence](../../../docs/specs/agents/skills/remdo-converge-change.md#convergence)
flow for scope reporting and every transition or outcome.

## Run the quality steps

At the simplification step, dispatch the contract's independent assessments:

- Invoke `$remdo-simplify` for changed code and tests. Pass a change
  [assessment target](../../../docs/specs/agents/assessment-target.md) with the
  retained scope and its applicable contracts.
- For all remaining changed artifacts together, invoke one bounded
  fresh-context review against their authoritative contracts. Require an
  `outcome`, the reviewed `target`, and any `findings`, `options`, or `reason`,
  following the [`remdo-simplify` result](../../../docs/specs/agents/skills/remdo-simplify.md#result).

Run independent assessments concurrently when possible and wait for every
result before editing. Retain each complete result.

When the contract requires a cleanup audit, run `pnpm run audit:cleanup`. At the
verification step, invoke `$remdo-verify-change` with the retained scope and
wait for its complete result. Route all results and correction candidates
through the authoritative flow; do not add another quality loop.

## Apply corrections

Apply a complete correction batch only after the current step finishes. Validate
it against its applicable authoritative contracts and repair inconsistencies
introduced by it.

For a commit range, require an attached `HEAD`, then stage only the validated
batch and create one normal nonempty commit. Leave uncommitted-scope corrections
uncommitted. Record the selected diff after the batch is committed or retained,
compare it with previously assessed states, then route the refreshed scope
through the contract.

## Report

Return the specification's
[Result](../../../docs/specs/agents/skills/remdo-converge-change.md#result). When
addressing a human, render it under the shared
[Reports](../../../docs/specs/agents/protocol.md#reports) contract.
