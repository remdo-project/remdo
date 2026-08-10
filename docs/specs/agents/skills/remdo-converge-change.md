# remdo-converge-change

This skill owns simplification, cleanup, verification, and evidence-supported
correction for one repository change. It returns an
[agent result](../protocol.md#results). One
[change scope](../change-scope.md) bounds the run; the skill does not select or
expand intended behavior.

## Authority

[Repository authority](../instructions.md#repository-authority): corrections
remain uncommitted for `uncommitted`; for a commit range on an attached branch,
the skill autonomously commits each coherent correction batch.

## Convergence

The skill resolves its change scope before other repository work. Immediately
after resolution, it reports the selected scope as a short, standalone
`Scope:` line before continuing. It reports `uncommitted changes` or the
caller-visible Git range, without internal commit IDs or other progress. For a
commit range, `BASE` remains fixed while `HEAD` advances through correction
commits; later stages assess `BASE..HEAD`.

```text
[resolve scope]
    ├─ no change ─────────────────────────> [converged]
    │ ready
    v
[simplify current state once]
    │
    v
[cleanup audit]
    ├─ corrections ─> [apply + validate] ─> ↩ cleanup audit
    │ passed or scope has no code/tests
    v
[verify current state]
    ├─ corrections ─> [apply + validate] ─> ↩ cleanup audit
    ├─ correction left unapplied ─────────> [not-converged]
    │ no determined correction
    v
[converged]
```

One or more independent simplification assessments collectively cover the
resolved change once. Each receives only its target and applicable authoritative
contracts. The skill applies determined behavior-preserving findings and
retains options as [concerns](../protocol.md#concerns).

Verification invokes [`remdo-verify-change`](remdo-verify-change.md). The skill
preserves its finding dispositions, applies corrections from failed checks and
[`confirmed` findings](remdo-verify-change.md#findings), and leaves `material
out of scope` findings unchanged.

After each correction batch, the skill refreshes the retained scope. It
converges without further quality steps if no selected diff remains.

A repeated repository state stops with a concern.

## Result

`findings` carries every verifier disposition across iterations and marks each
confirmed finding as fixed or uncorrected. `verification.findings` is the
latest iteration only. `simplification`, `cleanup`, and `verification` contain
the complete latest results for the state they assessed.

The result uses this shape:

```yaml
outcome: <converged | not-converged | stopped>
concerns: # if any
  - source: <originating capability or participant>
    summary: <condition>
scope: <resolved scope or resolution failure>
corrections: # if any
  - source: <simplification | cleanup | verification>
    summary: <applied correction>
simplification: # if run
  - source: <assessment capability or participant>
    result: <complete result>
cleanup: # if evaluated
  command: <command>
  status: <passed | failed | not-run>
  details: <failure evidence or reason not run> # if failed or not-run
verification: <complete latest remdo-verify-change result> # if run
findings: # if any
  - summary: <finding>
    source: <codex | claude>
    disposition: <confirmed | rejected | unresolved | material out of scope>
    reason: <disposition reason>
    resolution: <fixed | uncorrected> # if confirmed
reason: <condition that prevented or stopped convergence> # if not converged or stopped
```

`not-converged` means a completed quality step left a determined correction
unapplied.
