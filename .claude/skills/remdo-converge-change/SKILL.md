---
name: remdo-converge-change
description: Simplify, review, and verify one RemDo change scope (uncommitted work, otherwise the branch against origin/main) with Claude Code's /simplify and /code-review. Use only when the caller explicitly invokes remdo-converge-change.
argument-hint: "[uncommitted | <base>..HEAD | <base>...HEAD]"
---

# RemDo Converge Change

Converge one [change scope](../../../docs/specs/agents/change-scope.md)
without selecting or expanding its intended behavior.

## Authority

An uncommitted scope stays uncommitted: leave every edit unstaged and the index
unchanged. For a commit range, commit each validated step's edits as one
[conventional commit](../../../CONTRIBUTING.md#git-workflow), staging only its
paths. On `main` or a detached `HEAD`, a commit range returns `stopped` before
editing.

## Steps

Wait for each invoked skill's result before continuing.

1. **Scope.** Run `git fetch origin main`, then
   `sh .agents/skills/_shared/tools/resolve-scope.sh [scope]` with the caller's
   scope, if any. Report its selection as a standalone `Scope:` line. If the
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
   contains code or tests. Fix failures the change caused,
   [validate](#validate) the fixes, and rerun the failed checks. If a failure
   remains, then return `stopped`.
6. Return `converged`.

### Validate

Run the affected tests and static checks the testing policy requires before a
commit. Repair or revert edits those checks fail; if a failure remains, then
return `stopped`. Persist the edits under [Authority](#authority).

## Result

Rerun the resolver with the step-1 selection for the final `scope`. Report
under the shared [Reports](../../../docs/specs/agents/protocol.md#reports)
contract, with the shared [result fields](../../../docs/specs/agents/protocol.md#results)
and the [`ChangeScopeResult`](../../../docs/specs/agents/change-scope.md#result-type) type:

```yaml
outcome: <converged | stopped>
reason: <stopping condition> # if stopped
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
