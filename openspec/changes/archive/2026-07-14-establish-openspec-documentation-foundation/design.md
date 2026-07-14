## Context

RemDo's durable product behavior currently lives beside principles, contributor
policy, development policy, runbooks, and a large status scratchpad under
`docs/`. The corpus already requires one owner per topic and minimal,
scope-first contracts, but OpenSpec introduces a second location and a lifecycle
that distinguishes accepted specs from active changes.

This foundation must support a multi-PR migration with unrelated work landing
between migration PRs. It must therefore make ownership unambiguous at every
intermediate state and leave a small cross-session navigation aid.

## Goals / Non-Goals

**Goals:**

- Define which durable material belongs in OpenSpec and which remains in
  `docs/`.
- Preserve one normative owner per behavior throughout gradual migration.
- Encode RemDo's minimal, observable, implementation-independent spec style in
  OpenSpec configuration.
- Keep migration status short, explicit, and disposable.

**Non-Goals:**

- Migrate any product capability in this change.
- Rewrite or classify the full `docs/todo.md` backlog.
- Change product behavior, application code, or test behavior.
- Decide the complete order of later capability migrations.

## Decisions

### Main specs represent accepted durable behavior

`openspec/specs/` owns accepted product contracts. Proposed behavior stays in
`openspec/changes/` until incorporated. This follows OpenSpec's lifecycle and
avoids carrying known unimplemented features in main specs with separate
suspension notes.

Alternative: retain the existing target-ahead-of-code convention in main specs
and track divergences separately. Rejected because it duplicates lifecycle state
that active OpenSpec changes already represent.

### Migration is capability-atomic

An unmigrated capability remains owned by its current `docs/` document. A
migration PR moves the complete agreed capability contract, updates inbound
links, and removes the former normative definition. Structural cleanup and
clarification may accompany that move; behavior changes use their own OpenSpec
change.

Alternative: copy first and delete legacy docs later. Rejected because the
overlap creates two authorities that can drift across interwoven PRs.

### Non-product documentation remains in `docs/`

Project principles, contributor and documentation policy, development policy,
and runbooks remain normal documentation. OpenSpec main specs are not a general
Markdown replacement.

Alternative: model every durable project rule as an OpenSpec capability.
Rejected because scenario-shaped product requirements are a poor fit for policy
and procedural reference material.

### A temporary manifest tracks migration progress

`openspec/MIGRATION.md` records only the current phase, completed capabilities,
and one next capability. It is deleted when migration finishes. The first next
capability is `list-types`.

Alternative: use one long-lived OpenSpec change as the tracker. Rejected because
it would keep product deltas unincorporated until the entire multi-PR migration
finished. A GitHub issue remains viable later if repository-local status proves
unhelpful.

### OpenSpec configuration carries writing constraints

`openspec/config.yaml` supplies project context and artifact rules that preserve
scope-first, minimal, observable contracts and prevent implementation-detail
inventories. Requirements group coherent behavior; scenarios cover meaningful
branches rather than restating each sentence.

Alternative: rely only on contributor memory and links to
`docs/documentation.md`. Rejected because artifact generation consumes the
OpenSpec configuration directly.

### This planning capability is not archived into main specs

The default schema requires a spec artifact before tasks become apply-ready.
`documentation-foundation` therefore exists only inside this change. Archive
the completed documentation-only change with `--skip-specs` so
`openspec/specs/` remains product-only.

## Risks / Trade-offs

- **The migration manifest is a custom OpenSpec-root convention.** → Keep it
  deliberately tiny and delete it at migration completion.
- **Capability-atomic migration may make some documentation PRs larger.** →
  Choose narrow capability boundaries and split overloaded legacy documents
  before or during their own focused migration.
- **Mandatory OpenSpec scenarios can inflate terse contracts.** → Group rules
  into coherent requirements and keep only scenarios that clarify observable
  branches or failure behavior.
- **Existing target-ahead-of-code docs cannot always move directly.** → Leave
  them under their current owner until current behavior is separated from a
  proposed OpenSpec change.

## Migration Plan

1. Update the documentation workflow and OpenSpec configuration to establish
   the new ownership and lifecycle rules.
2. Add the temporary migration manifest with foundation as the current phase
   and `list-types` as the next capability.
3. Verify documentation links, Markdown, and OpenSpec health without changing
   product specs or application code.
4. Archive this change with `--skip-specs` after implementation.
5. Migrate `list-types` in the next single-purpose change.

Rollback is removal of the foundation edits and migration manifest; no product
or persisted-data rollback is involved.

## Open Questions

None. Later capability boundaries are decided incrementally as each migration
is prepared.
