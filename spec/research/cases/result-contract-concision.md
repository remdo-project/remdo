# Result Contract Concision

This case records a wording correction in the
[`remdo-verify-change`](../../skills/remdo-verify-change.md) result contract.

## Pre-change

```markdown
## Result

The result identifies the reviewed scope, reports check outcomes, and
attributes returned output to its reviewer. It also identifies every
unavailable or failed reviewer.

A clean result means applicable checks passed and no findings were reported.
Unavailable or failed reviewers remain visible but may coexist with a clean
result. The result is evidence for its caller, not approval.
```

## Change request

**Challenge:** The result contract was longer than necessary.

**Agreed actions:** Distill its key facts and state them more simply and briefly.

## Post-change

```markdown
## Result

The result reports the scope, check outcomes, and each reviewer's output,
unavailability, or failure. It is clean when checks pass and no findings are
reported; reviewer unavailability or failure alone does not make it non-clean.
The result is evidence, not approval.
```
