# Component Vocabulary

This case records a terminology correction made while drafting the
[`remdo-verify-change`](../../skills/remdo-verify-change.md) contract.

## Observed

The draft named the verifier's input three ways:

```text
verifies one explicitly selected repository change
## Candidate
The caller selects exactly one scope
```

## Problem

The terms suggested distinctions between concepts that were intended to be the
same, leaving the reader to reconcile them.

## Improvement

The contract defined `scope` as component vocabulary and reused it throughout:

```text
verifies one explicit scope
## Scope
The caller explicitly selects one scope
```
