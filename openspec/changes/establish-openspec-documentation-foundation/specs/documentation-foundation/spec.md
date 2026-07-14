## ADDED Requirements

### Requirement: Documentation has one normative owner

The documentation system MUST assign each durable product behavior to exactly
one normative location. Unmigrated behavior MUST remain owned by its existing
`docs/` document, while migrated behavior MUST be owned by
`openspec/specs/<capability>/spec.md`; a migration MUST remove the former
normative definition and update its inbound links in the same change.

#### Scenario: A capability is migrated

- **WHEN** a documentation migration moves an accepted capability into OpenSpec
- **THEN** the repository contains one normative definition under
  `openspec/specs/` and no normative duplicate under `docs/`

#### Scenario: An unrelated change touches an unmigrated capability

- **WHEN** product work changes behavior whose durable owner is still under `docs/`
- **THEN** that document remains the authority until a dedicated migration
  moves the complete capability

### Requirement: OpenSpec separates accepted and proposed behavior

The documentation system MUST keep accepted durable product behavior in
`openspec/specs/` and proposed behavior, design, and implementation tasks in
`openspec/changes/` until the change is incorporated. Known unimplemented
features MUST NOT be copied into main specs as migration baselines.

#### Scenario: Proposed behavior is not implemented

- **WHEN** a change defines product behavior that has not yet been incorporated
- **THEN** the behavior remains in the active change rather than the main
  capability spec

### Requirement: Non-product documentation remains outside main specs

The documentation system MUST keep project principles, contributor and
documentation policy, development policy, and runbooks in `docs/` rather than
representing them as durable product capabilities.

#### Scenario: Documentation policy is updated

- **WHEN** a change updates how contributors write or maintain specifications
- **THEN** the policy is updated in its owning `docs/` document and not added to
  `openspec/specs/`

### Requirement: OpenSpec artifacts follow RemDo writing invariants

OpenSpec configuration MUST direct generated specifications to be scope-first,
minimal, observable, and independent of derivable implementation detail.
Requirements MUST group coherent behavior, and scenarios MUST clarify observable
outcomes rather than merely restating their requirement.

#### Scenario: A capability spec is generated

- **WHEN** OpenSpec instructions supply the project context and artifact rules
- **THEN** the resulting spec states the behavioral contract without an
  implementation inventory or redundant scenarios

### Requirement: Migration status stays small and disposable

The repository MUST keep one temporary migration manifest under `openspec/`
that records the current phase, completed capability migrations, and exactly one
next capability. The manifest MUST be deleted when the documentation migration
is complete.

#### Scenario: Foundation is established

- **WHEN** the foundation change is implemented
- **THEN** the manifest identifies the foundation phase, records no completed
  capability migration, and names `list-types` as next

#### Scenario: A capability migration completes

- **WHEN** a later migration incorporates a capability into the main specs
- **THEN** the manifest records that capability as completed and selects one
  next capability
