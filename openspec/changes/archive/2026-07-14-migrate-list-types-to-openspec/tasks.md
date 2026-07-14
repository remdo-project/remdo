## 1. Migrate the capability contract

- [x] 1.1 Compare `docs/outliner/list-types.md` with the focused implementation,
  tests, and `docs/todo.md`; adjust the delta spec to contain the complete
  accepted observable contract and no implementation encoding.
- [x] 1.2 Sync the `outliner-list-types` delta into the main OpenSpec specs and
  confirm `openspec/specs/outliner-list-types/spec.md` is the complete new
  normative owner.
- [x] 1.3 Remove `docs/outliner/list-types.md` and update every inbound
  documentation link to the main `outliner-list-types` spec.

## 2. Advance migration tracking

- [x] 2.1 Update `openspec/MIGRATION.md` to record `outliner-list-types` as
  completed and name exactly one next coherent capability migration.

## 3. Verify the migration

- [x] 3.1 Confirm the repository has one normative list-types contract, no dead
  references to the removed document, and a valid OpenSpec change and store.
- [x] 3.2 Run the repository's Markdown and required final checks, fixing any
  failures caused by the migration.
