---
name: remdo-converge-change
description: Converge a default or explicitly selected RemDo uncommitted or Git-range scope through fresh simplification, cleanup, verification, correction, and re-verification. Use only when the caller explicitly invokes $remdo-converge-change.
---

# RemDo Converge Change

Read the authoritative
[`remdo-converge-change`](../../../docs/specs/agents/skills/remdo-converge-change.md)
specification in full before repository work. Follow its
[Convergence](../../../docs/specs/agents/skills/remdo-converge-change.md#convergence)
algorithm for all ordering, decisions, transitions, and outcomes. The procedure
below only binds its operations to repository mechanisms.

## Repository bindings

When [Convergence](../../../docs/specs/agents/skills/remdo-converge-change.md#convergence)
resolves its [change scope](../../../docs/specs/agents/change-scope.md), run the
shared resolver from the repository root with the omitted or supplied scope:

```sh
sh .agents/skills/_shared/tools/resolve-scope.sh [scope]
```

Retain the supplied selection, or the default selected by the
[change-scope](../../../docs/specs/agents/change-scope.md#resolution) contract,
separately from the emitted `STATE`, `SCOPE`, `BASE`, `HEAD_SHA`, and file list.
Decode them as the complete change-scope result. Map resolver failure to the
specification's stopped result with its failed change-scope result.

Record the complete selected diff, including untracked-file content, as the
initial repository-state identity. When
[Correct the state](../../../docs/specs/agents/skills/remdo-converge-change.md#correct-the-state)
refreshes the scope, rerun the resolver with `uncommitted` or the retained
`<BASE>..HEAD`, replace its resolved fields without replacing the selection,
and record the refreshed complete diff. Compare these content snapshots when
the specification checks for a repeated repository state; paths or ref IDs
alone are not state identity.

At [Convergence's simplification step](../../../docs/specs/agents/skills/remdo-converge-change.md#convergence),
dispatch its independent assessments:

- Invoke `$remdo-simplify` for changed code and tests. Pass a change
  [assessment target](../../../docs/specs/agents/assessment-target.md) with the
  retained scope, and provide its applicable contracts separately.
- For all remaining changed artifacts together, invoke one bounded
  fresh-context review against their authoritative contracts. Require an
  `outcome`, the reviewed `target`, and any `findings`, `options`, or `reason`,
  following the [`remdo-simplify` result](../../../docs/specs/agents/skills/remdo-simplify.md#result).

In the specification's
[Quality cycle](../../../docs/specs/agents/skills/remdo-converge-change.md#quality-cycle),
run `pnpm run audit:cleanup` for the cleanup audit. At verification, invoke
`$remdo-verify-change` with the retained scope.

If repository permissions block commit-range persistence under the
specification's [Authority](../../../docs/specs/agents/skills/remdo-converge-change.md#authority),
request runtime escalation without asking again for staging or commit permission.

## Report

Return the specification's [Result](../../../docs/specs/agents/skills/remdo-converge-change.md#result). When
addressing a human, render it under the shared [Reports](../../../docs/specs/agents/protocol.md#reports) contract.
