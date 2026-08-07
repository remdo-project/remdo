# remdo-converge-change

This skill verifies a repository change, applies every correction supported by
the evidence, and repeats until no further correction can be determined. It
returns an [agent result](../results.md#results). One
[change scope](../change-scope.md) bounds the run; the skill does not select or expand intended behavior.

## Convergence

The skill resolves its change scope before other repository work. Immediately
after resolution, it reports the selected scope as a short, standalone
`Scope:` line before continuing. It reports `uncommitted changes` or the
caller-visible Git range, without internal commit IDs or other progress.

The skill invokes [`remdo-verify-change`](remdo-verify-change.md) against the
current state. It applies every correction it can determine from a failed check
or [`confirmed` finding](remdo-verify-change.md#findings) and carries every
finding disposition into its result. It does not correct `material out of
scope` findings or reinterpret dispositions.

For `uncommitted`, corrections remain uncommitted. For a commit range, the
resolved `BASE` remains fixed and the skill commits corrections before running
verification again. It does not apply commit-range corrections from a detached `HEAD`.

Before committing or re-verifying, the skill checks the correction batch
against every applicable authoritative contract.

After applying corrections, the skill runs complete verification again. It does
not re-verify unchanged state; [degraded verification](remdo-verify-change.md#result) remains usable.

The skill converges when no determined correction remains, even if
[concerns](../results.md#concerns) remain. A `stopped` verification stops
convergence unless the skill can correct its failed check.

## Result

`findings` carries every disposition across verification iterations and marks
each confirmed finding as fixed or uncorrected. `verification.findings` is the
latest iteration only.

When run, `verification` contains the complete latest [`remdo-verify-change` result](remdo-verify-change.md#result).

The result uses this shape:

```yaml
outcome: <converged | not-converged | stopped>
concerns: # if any
  - source: <originating capability or participant>
    summary: <condition>
scope: <resolved scope or resolution failure>
corrections: # if any
  - summary: <applied correction>
verification: <complete latest remdo-verify-change result> # if run
findings: # if any
  - summary: <finding>
    source: <codex | claude>
    disposition: <confirmed | rejected | unresolved | material out of scope>
    reason: <disposition reason>
    resolution: <fixed | uncorrected> # if confirmed
reason: <condition that prevented or stopped convergence> # if not converged or stopped
```

`not-converged` means completed verification left a determined correction
unapplied. `stopped` means any other condition prevented convergence.

## Future

- Add a simplification step and its `audit:cleanup` backstop once the step's
  scope and ownership are specified.
