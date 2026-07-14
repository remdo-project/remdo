## 1. Migrate the capability contract

- [ ] 1.1 Compare `docs/outliner/list-types.md` with the focused implementation,
  tests, and `docs/todo.md`; adjust the delta spec to contain the complete
  accepted observable contract and no implementation encoding.
- [ ] 1.2 Sync the `list-types` delta into the main OpenSpec specs and confirm
  `openspec/specs/list-types/spec.md` is the complete new normative owner.
- [ ] 1.3 Remove `docs/outliner/list-types.md` and update every inbound
  documentation link to the main `list-types` spec.

## 2. Advance migration tracking

- [ ] 2.1 Update `openspec/MIGRATION.md` to record `list-types` as completed and
  name exactly one next coherent capability migration.

## 3. Verify the migration

- [ ] 3.1 Confirm the repository has one normative list-types contract, no dead
  references to the removed document, and a valid OpenSpec change and store.
- [ ] 3.2 Run the repository's Markdown and required final checks, fixing any
  failures caused by the migration.
