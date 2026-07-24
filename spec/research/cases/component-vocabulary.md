# Component Vocabulary

This user-raised case records a terminology correction made while drafting the
[`remdo-verify-change`](../../skills/remdo-verify-change.md) contract in Codex
session `019f744f-c6fd-7f03-8e89-7362d3ba18f4`.

## Pre-change

```text
verifies one explicitly selected repository change
## Candidate
The caller selects exactly one scope
```

## Change request

**Challenge:** The draft used `repository change`, `candidate`, and `scope` for
the same verifier input, leaving the reader to reconcile competing terms.

**Agreed actions:** Define `scope` as component vocabulary and use it
consistently.

## Post-change

```text
verifies one explicit scope
## Scope
The caller explicitly selects one scope
```
