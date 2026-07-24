## Context

RemDo currently limits main OpenSpec specs to durable product behavior while
keeping development policy in `docs/` and agent instructions. That boundary
cannot give growing build, test, operational, or agent workflows the same
version-independent source of truth as product capabilities. OpenSpec also
generates version-stamped skills and commands that remain upstream-owned.

## Goals / Non-Goals

**Goals:**

- Establish one durable specification flow for any maintained RemDo behavior
  that warrants a contract.
- Introduce a generic development change-workflow capability for future
  independently reviewed lifecycle requirements.
- Keep RemDo workflow customization independent of generated OpenSpec assets.
- Remove the archive-only commit exception rather than preserve behavior that
  will be reconsidered as part of the complete workflow.

**Non-Goals:**

- Specify every development, testing, build, or operational detail.
- Define or implement the complete development change lifecycle.
- Change standard OpenSpec artifact structure or fork its schema.
- Introduce a RemDo workflow conductor or agent adapters.
- Modify generated OpenSpec skills or commands.

## Decisions

### Use one specification authority across behavior domains

Main OpenSpec specs will own durable requirements for product, development, and
operational capabilities. Domain-oriented capability names retain navigation
without creating separate lifecycles. `docs/` continues to own principles,
explanations, contributor guidance, runbooks, and behavior not yet migrated.

Alternative: retain product-only main specs and keep workflow contracts in
`docs/dev/`. Rejected because it would preserve two change and authority models
for requirements that need the same evolution and dependency-reconciliation
properties.

### Establish authority before implementation

The durable capability records only the stable requirement that RemDo workflow
contracts survive OpenSpec updates. The conductor and complete lifecycle remain
deferred until their behavior is agreed, avoiding an unused implementation
shell or a temporary archive-specific abstraction.

Alternative: retain archive-only finalization as the first implemented slice.
Rejected because early spec synchronization makes that flag a mechanical detail
of a broader finalization phase rather than a durable standalone behavior.

## Risks / Trade-offs

- **The broader spec boundary could encourage specification of trivial
  implementation detail.** → Keep the existing minimality and derivability
  rules, and require durable behavioral consequences rather than a particular
  audience.
- **The workflow specification governs changes to itself.** → The currently
  accepted workflow governs each change; new behavior becomes authoritative only
  when incorporated into the main spec.
- **The capability initially has no custom workflow implementation.** → Keep its
  single requirement limited to the stable authority boundary and add execution
  behavior only with the complete lifecycle.
