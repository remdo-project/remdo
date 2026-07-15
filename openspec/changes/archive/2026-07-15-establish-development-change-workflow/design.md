## Context

RemDo currently limits main OpenSpec specs to durable product behavior while
keeping development policy in `docs/` and agent instructions. That boundary
cannot give growing build, test, operational, or agent workflows the same
version-independent source of truth as product capabilities. The repository
already has RemDo-owned shared skills under `.agents/skills/`, while OpenSpec
generates version-stamped skills and commands for each supported agent.

The first workflow behavior is already agreed and exercised: when an archive
correctly uses `--skip-specs`, its mechanical archive-only commit follows in the
same authorized action. This makes it a low-risk vertical slice for establishing
the wider capability.

## Goals / Non-Goals

**Goals:**

- Establish one durable specification flow for any maintained RemDo behavior
  that warrants a contract.
- Introduce a generic development change-workflow capability that can grow one
  independently reviewed requirement at a time.
- Keep RemDo workflow customization independent of generated OpenSpec assets.
- Implement the existing archive-only finalization rule through a thin shared
  RemDo conductor.

**Non-Goals:**

- Specify every development, testing, build, or operational detail.
- Change standard OpenSpec artifact structure or fork its schema.
- Implement automatic `.openspec.yaml` staging, dependent-branch handoff, or
  general next-step prediction in this change.
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

### Separate the generic capability from its initial requirement

The durable capability is `development-change-workflow`; archive-only
finalization is merely its first requirement. Later automatic actions and
lifecycle transitions update the same capability without pretending they are
designed now.

Alternative: create a capability named after archive automation. Rejected
because each incremental workflow rule would create another fragmented owner.

### Implement RemDo behavior with a conductor over OpenSpec

A shared `remdo-change-flow` skill will own RemDo-specific orchestration and
delegate standard OpenSpec mechanics to the project-local CLI and generated
workflows. Generated OpenSpec assets remain replaceable during dependency
updates. `AGENTS.md` retains only the global routing and permission boundary
needed for the conductor to act safely.

Alternative: edit generated OpenSpec archive skills directly. Rejected because
`openspec update` replaces those version-stamped files and would mix local policy
with upstream implementation.

Alternative: fork the OpenSpec schema. Rejected because schemas control artifact
graphs and templates, while the required behavior coordinates OpenSpec with Git
and agent permissions.

### Add workflow automation explicitly before extracting a framework

Each automatic action will initially define its own trigger, preconditions,
allowed mutations, validation, and failure behavior. A declarative automation
registry will be considered only after repeated actions reveal a stable shared
shape.

Alternative: build a generic auto-action system now. Rejected because the first
requirement provides insufficient evidence for its abstraction.

## Risks / Trade-offs

- **The broader spec boundary could encourage specification of trivial
  implementation detail.** → Keep the existing minimality and derivability
  rules, and require durable behavioral consequences rather than a particular
  audience.
- **Direct invocation of an upstream OpenSpec skill could bypass the RemDo
  conductor.** → Make the RemDo skill the repository-level route for customized
  lifecycle actions while keeping upstream skills as delegated primitives.
- **The workflow specification governs changes to itself.** → The currently
  accepted workflow governs each change; new behavior becomes authoritative only
  when incorporated into the main spec.
- **OpenSpec updates could change delegated interfaces.** → Treat the main spec
  as the compatibility target and adapt or replace the conductor implementation
  during dependency refresh.
