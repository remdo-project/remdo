# Section Responsibility

This case records a structural correction made while drafting the
[`remdo-verify-change`](../../skills/remdo-verify-change.md) contract.

## Pre-change

````markdown
## Verification

```text
[explicit scope]
    │
    v
[deterministic checks]
    ├─ failure ─> [report and stop]
    │
    └─ pass
        ├─> [fresh Codex review] ──┐
        └─> [fresh Claude review] ─┴─> [report]
```

The verifier runs applicable deterministic repository checks first. Any failure
is reported and stops verification before reviewer calls. After all checks
pass, it runs fresh, independent, read-only Codex and Claude reviews in
parallel.

Each reviewer receives the explicit scope and a request for a read-only review
under repository rules. The verifier attributes the returned output to that
reviewer and includes it in the result.

A reviewer failure does not abort the other review. The result identifies every
unavailable or failed reviewer; neither condition by itself fails verification.

## Result

The result identifies the reviewed scope and reports check outcomes, reviewer
activity, unavailable or failed reviewers, and evidenced findings with their
provenance. A clean result means applicable checks passed and no findings were
reported; unavailable or failed reviewers remain visible but may coexist with a
clean result. The result is evidence for its caller, not approval.
````

## Change request

**Challenge:** The text alternated between verification flow and result
behavior.

**Agreed actions:** Give each fragment one clear responsibility.

## Post-change

````markdown
## Verification

```text
[explicit scope]
    │
    v
[deterministic checks]
    ├─ failure ─> [report and stop]
    │
    └─ pass
        ├─> [fresh Codex review] ──┐
        └─> [fresh Claude review] ─┴─> [report]
```

The verifier runs applicable deterministic repository checks first. Any failure
is reported and stops verification before reviewer calls.

After all checks pass, the verifier requests fresh, independent Codex and
Claude reviews in parallel, passing the explicit scope and requiring read-only
operation under repository rules. A reviewer failure does not abort the other
review.

## Result

The result identifies the reviewed scope, reports check outcomes, and
attributes returned output to its reviewer. It also identifies every
unavailable or failed reviewer.

A clean result means applicable checks passed and no findings were reported.
Unavailable or failed reviewers remain visible but may coexist with a clean
result. The result is evidence for its caller, not approval.
````
