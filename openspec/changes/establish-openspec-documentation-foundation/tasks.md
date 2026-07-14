## 1. Establish documentation authority

- [ ] 1.1 Update `docs/documentation.md` to define the OpenSpec main-spec and
  active-change lifecycle while preserving the single-owner, scope-first, and
  minimal-contract invariants.
- [ ] 1.2 Update `AGENTS.md` and `docs/contributing.md` so navigation and
  contribution guidance send durable product behavior to its current owner
  during migration and to OpenSpec after migration.
- [ ] 1.3 Confirm the workflow keeps principles, contributor/development policy,
  and runbooks in `docs/` and does not create a durable
  documentation-governance product spec.

## 2. Configure and track the migration

- [ ] 2.1 Add concise RemDo project context and artifact rules to
  `openspec/config.yaml` for scope-first, minimal, observable,
  implementation-independent specs and non-redundant scenarios.
- [ ] 2.2 Add `openspec/MIGRATION.md` with the foundation phase, no completed
  capability migrations, and `list-types` as the single next capability.
- [ ] 2.3 Check that every affected documentation topic has one normative owner
  and all changed inbound links resolve.

## 3. Verify the foundation

- [ ] 3.1 Run OpenSpec validation and health checks for the change and
  repository.
- [ ] 3.2 Run the repository's required Markdown and final checks, fixing any
  failures caused by this change.
- [ ] 3.3 Confirm the completed change is documentation-only and must be archived
  with `--skip-specs` before handing off the `list-types` migration.
