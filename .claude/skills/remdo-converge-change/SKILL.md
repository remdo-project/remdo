---
name: remdo-converge-change
description: Simplify, review, and verify one RemDo change scope with Claude Code's /simplify and /code-review. Use only when the caller explicitly invokes remdo-converge-change.
argument-hint: "[uncommitted | <base>..HEAD | <base>...HEAD]"
---

# RemDo Converge Change

Converge one [change scope](../../../docs/specs/agents/change-scope.md)
without selecting or expanding its intended behavior.

## Authority

An uncommitted scope stays uncommitted. For a commit range, the skill commits
each validated step's edits as one
[conventional commit](../../../CONTRIBUTING.md#git-workflow) under
[repository authority](../../../AGENTS.md#repository-authority).

## Steps

Wait for each invoked skill's result before continuing.

1. **Scope.** Run `git fetch origin main`, then
   `sh .agents/skills/_shared/tools/resolve-scope.sh [scope]` with the caller's
   scope, if any. Report its
   [display](../../../docs/specs/agents/change-scope.md#caller-visible-display)
   as a standalone `Scope:` line. If the
   state is `no-change`, then return `converged`; if it is `failed`, or a
   commit range on a detached `HEAD`, then return `stopped`. The target is
   `<BASE>..HEAD` with the resolved `BASE` for a commit range, or each `FILES`
   path as a quoted argument for an uncommitted scope.
2. **Simplify.** Run `/simplify <target>`, then [validate](#validate) its edits.
3. **Review.** Run `/code-review high --fix <target>`, then
   [validate](#validate) its edits.
4. **Probe.** Run `/code-review high <target>` and leave its findings
   unapplied. Classify each as actionable or not, and by origin: `introduced`
   by steps 2–3, `deferred` when step 2 or 3 left it unapplied, or
   `missed` otherwise.
5. **Handoff checks.** Run the testing policy's
   [handoff verification](../../../docs/dev/testing.md#verification-lifecycle),
   plus `pnpm run audit:cleanup` when the scope contains code or tests, and
   handle failures under that policy. [Validate](#validate) any fixes; if a
   failure the change caused remains, then return `stopped`.
6. Return `converged`.

### Validate

Skip validation when the step made no edits. Otherwise run the testing
policy's [pre-commit checks](../../../docs/dev/testing.md#verification-lifecycle).
Repair edits those checks fail; if a failure remains, then return `stopped`
with the edits left in place. Persist the
edits under [Authority](#authority), then rerun the resolver with `uncommitted`
or the commit-range target and refresh `scope` under the
[change-scope refresh rule](../../../docs/specs/agents/change-scope.md#result-type).
If it reports `no-change`, then return `converged`; if it reports `failed`,
then return `stopped`. For an uncommitted scope,
the refreshed `FILES` become the target.

## Result

Report under the shared [Reports](../../../docs/specs/agents/protocol.md#reports)
contract, with the shared [result fields](../../../docs/specs/agents/protocol.md#results)
and the [`ChangeScopeResult`](../../../docs/specs/agents/change-scope.md#result-type) type:

```yaml
outcome: <converged | stopped>
scope: <ChangeScopeResult>
uncommitted: # commit range stopped with edits left in place, if any
  - <repository-relative path>
edits: # if any
  - step: <simplify | review | handoff>
    summary: <applied change>
    commit: <commit> # if committed
skipped: # findings from steps 2–3 left unapplied, if any
  - summary: <finding>
    reason: <why unapplied>
probe: # if step 4 ran
  - summary: <finding>
    actionable: <true | false>
    origin: <introduced | deferred | missed>
handoff_checks: # if step 5 ran
  - command: <command>
    status: <passed | failed>
left_to_ci: # checks step 5 left to CI, if step 5 ran
  - <check or group>
```
