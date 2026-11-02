---
name: remdo-converge-change
description: Simplify, review, and verify one RemDo change scope (uncommitted work, otherwise the branch against origin/main) with Claude Code's /simplify and /code-review. Use only when the caller explicitly invokes remdo-converge-change.
argument-hint: "[uncommitted | <base>..HEAD | <base>...HEAD]"
---

# RemDo Converge Change

Converge one [change scope](../../../docs/specs/agents/change-scope.md)
without selecting or expanding its intended behavior.

## Authority

An uncommitted scope stays uncommitted. For a commit range, the skill commits
each validated step's edits as one
[conventional commit](../../../CONTRIBUTING.md#git-workflow) under
[repository authority](../../../AGENTS.md#repository-authority). On `main` or a
detached `HEAD`, a commit range returns `stopped` before editing.

## Steps

Wait for each invoked skill's result before continuing.

1. **Scope.** Run `git fetch origin main`, then
   `sh .agents/skills/_shared/tools/resolve-scope.sh [scope]` with the caller's
   scope, if any. Report its
   [display](../../../docs/specs/agents/change-scope.md#caller-visible-display)
   as a standalone `Scope:` line. If the
   state is `no-change`, then return `converged`; if it is `failed`, then
   return `stopped`. The target is the selection for a commit range, or the
   space-separated `FILES` for an uncommitted scope.
2. **Simplify.** Run `/simplify <target>`, then [validate](#validate) its edits.
3. **Review.** Run `/code-review high --fix <target>`, then
   [validate](#validate) its edits.
4. **Probe.** Run `/code-review high <target>` and leave its findings
   unapplied. Classify each as actionable or not, and as introduced by steps
   2–3 or missed by step 3.
5. **Handoff checks.** Run the testing policy's
   [handoff verification](../../../docs/dev/testing.md#verification-lifecycle)
   for the complete scope, plus `pnpm run audit:cleanup` when the scope
   contains code or tests. Handle failures under that policy: fix those the
   change caused, [validate](#validate) the fixes, and rerun the failed checks.
   If a failure the change caused remains, then return `stopped`.
6. Return `converged`.

### Validate

Skip validation when the step made no edits. Otherwise run the testing
policy's [pre-commit checks](../../../docs/dev/testing.md#verification-lifecycle).
Repair or revert edits those checks fail; if a failure remains, then return
`stopped`. Persist the edits under [Authority](#authority). For an uncommitted
scope, replace the target with the `FILES` of a resolver rerun with
`uncommitted`, so later steps cover files the edits added.

## Result

Refresh `scope` under the
[change-scope refresh rule](../../../docs/specs/agents/change-scope.md#result-type)
by rerunning the resolver with the step-1 selection. Report
under the shared [Reports](../../../docs/specs/agents/protocol.md#reports)
contract, with the shared [result fields](../../../docs/specs/agents/protocol.md#results)
and the [`ChangeScopeResult`](../../../docs/specs/agents/change-scope.md#result-type) type:

```yaml
outcome: <converged | stopped>
scope: <ChangeScopeResult>
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
    origin: <introduced | missed>
handoff_checks: # if step 5 ran
  - command: <command>
    status: <passed | failed>
```
