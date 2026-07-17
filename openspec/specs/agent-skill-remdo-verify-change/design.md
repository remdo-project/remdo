# RemDo Verify Change Agent Skill Design

## Scope

This document owns the current architecture of `remdo-verify-change`. The
adjacent spec owns its accepted behavior; the
[`development-change-workflow`](../development-change-workflow/spec.md) owns
lifecycle placement, approval, and user handoffs.

## Verification flow

```text
[request] -> [checks] -- pass --> [reviewer wave] -> [aggregate results]
              ^   |                                       |          |
              |   | failure                      accepted |          | no accepted
              |   +----------------+              finding |          | findings
              |                    v                      v          v
              +------------- [coordinator fix] <----------+     [converged result]
```

Checks and reviewers read the candidate. Only the coordinator writes, between
completed waves.

## Reviewer wave

```text
[candidate + check evidence]
             |
      +------+------+
      |             |
      v             v
[native Codex] [native Claude]
      |             |
      +------+------+
             |
             v
[confirm each native activation]
             |
             v
        [wave join]
             |
             v
[structured reviewer results]
```

## Review request and candidate

A request carries the candidate, review mode, and any mode-required baseline.

## Review lens

The native reviewer derives detailed intent from repository artifacts and
receives only the selected readiness lens.

### Specification readiness

> Review whether the selected requirements and designs are ready for approval.
> Implementation may be absent.

### Implementation readiness

> Review whether the selected implementation satisfies the approved
> requirements and designs in both directions.

## Reviewer adapters

Fresh Codex and Claude processes run concurrently with the same request, check
evidence, and result schema. Each invokes its provider's native review mode in
an isolated read-only session that preserves that mode and uses the runtime's
configured model.

Each adapter confirms native review activation from provider execution metadata
outside model-authored review content. The adapter owns its exact invocation and
activation witness, and returns the witness with its structured result.

## Result model

Each adapter returns activation evidence, sources, evidenced findings, and
completion state. The aggregate preserves reviewer provenance while
deduplicating findings and recording their dispositions.
