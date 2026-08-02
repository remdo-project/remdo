---
name: remdo-converge-change
description: Converge a default or explicitly selected RemDo uncommitted or Git-range scope by invoking remdo-verify-change, correcting confirmed issues, and re-verifying only changed repository states. Use only when the caller explicitly invokes $remdo-converge-change.
---

# RemDo Converge Change

Converge one scope under the authoritative
[`remdo-converge-change`](../../../docs/specs/agents/skills/remdo-converge-change.md)
contract. Do not expand intended behavior.

## Fix the scope

Accept an omitted or caller-supplied `remdo-verify-change` scope. Make scope
resolution the run's first repository action; apart from instructions required
to resolve it, do not inspect repository context or start other work first. If
the runtime requires a user-visible update before resolution, say only that
scope resolution is starting.

Invoke the verifier with that initial input and retain its resolved scope.
Immediately after successful resolution, emit a progress update containing
only `Scope: uncommitted changes` or `Scope: <requested-or-default-range>`.
Do not add commit IDs, changed files, or the next action to this update.

Use that scope for the rest of the run:

- Reinvoke the verifier with `uncommitted` for a resolved uncommitted scope.
- Reinvoke it with the fixed `<BASE>..HEAD` for a resolved commit range,
  allowing `HEAD` to advance while `BASE` remains immutable.

Stop and report the verifier's scope-resolution failure.

## Converge the state

For every verifier result:

1. Wait for verification to finish.
2. Collect every failed check and
   [`confirmed` finding](../../../docs/specs/agents/skills/remdo-verify-change.md#findings)
   you can correct into one complete correction batch. Preserve the verifier's
   finding dispositions and record confirmed findings that cannot be corrected.
3. If commit-range `HEAD` is detached, do not apply the correction batch;
   report that it prevents convergence. Otherwise apply the complete correction
   batch only after verification has finished.
4. Before committing or re-verifying, review the correction diff against every
   applicable authoritative contract and fix inconsistencies introduced by the
   batch. For durable documentation, check each applicable
   [`Documentation`](../../../docs/documentation.md) clause separately.
5. Keep uncommitted-scope corrections uncommitted. In commit-range scope, make
   one coherent correction commit before running verification again.
6. Run the complete verifier again only when the repository state changed. Use
   the retained scope, and repeat.

Do not amend, create an empty commit, or push.

Determine convergence under the authoritative specification's
[Convergence](../../../docs/specs/agents/skills/remdo-converge-change.md#convergence)
contract.

## Commit authority

Resolved commit-range scope on an attached branch declares autonomous authority
to stage and commit the correction batches produced by this run on that branch,
including when selected by the default. This authority covers only those
corrections and does not authorize pushing.

Resolved uncommitted scope does not authorize commits.

## Report

Return the result defined by the authoritative specification's
[Result](../../../docs/specs/agents/skills/remdo-converge-change.md#result) section.

## References

- [Convergence contract](../../../docs/specs/agents/skills/remdo-converge-change.md)
- [Verification contract](../../../docs/specs/agents/skills/remdo-verify-change.md)
- [Agent guidelines](../../../AGENTS.md)
