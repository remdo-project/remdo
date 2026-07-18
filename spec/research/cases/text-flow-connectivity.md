# Text Flow Connectivity

This case records a diagram correction made while drafting the
[`remdo-verify-change`](../../skills/remdo-verify-change.md) contract for a
terminal-first reading environment.

## Observed

The initial diagram depended on alignment and `+` characters to imply its
fan-out and convergence:

```text
                    +--> [repository checks] --+
[explicit scope] --+--> [fresh Codex review] --+--> [result]
                    +--> [fresh Claude review] -+
```

## Problem

The top and bottom paths ended at isolated characters rather than continuous
joins. The reader had to infer connections that the diagram did not draw.

## Improvement

The revised text diagram encoded every branch and join directly:

```text
[explicit scope]
    ├─> [repository checks] ───┐
    ├─> [fresh Codex review] ──┼─> [result]
    └─> [fresh Claude review] ─┘
```
