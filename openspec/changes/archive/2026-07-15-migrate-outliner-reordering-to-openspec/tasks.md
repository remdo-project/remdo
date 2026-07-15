## 1. Migrate the capability contract

- [x] 1.1 Clarify `docs/outliner/selection.md` so structural selection is the
  selection kind and note range is the shared one-or-more-note operand; update
  `openspec/MIGRATION-BACKLOG.md` with the accepted terminology and its intended
  permanent selection owner.
- [x] 1.2 Compare `docs/outliner/reordering.md` with the focused implementation,
  tests, `docs/todo.md`, and `openspec/MIGRATION-BACKLOG.md`; adjust the delta
  spec to contain the complete accepted observable contract and no
  implementation encoding.
- [x] 1.3 Sync the `outliner-reordering` delta into the main OpenSpec specs,
  preserve pointer drag-and-drop only as a brief `Future` direction, and confirm
  `openspec/specs/outliner-reordering/spec.md` is the complete new normative
  owner.
- [x] 1.4 Remove `docs/outliner/reordering.md` and update every inbound
  documentation link to the main `outliner-reordering` spec.
- [x] 1.5 Remove the invariant-only no-target scenario from the delta and main
  specs; track the unresolved inline-body reordering behavior in
  `docs/todo.md` for the note-body design pass.
- [x] 1.6 Add informative examples for reparenting and outdenting where a
  concrete outline materially clarifies the structural transformation.

## 2. Advance migration tracking

- [x] 2.1 Update `openspec/MIGRATION.md` to record `outliner-reordering` as
  completed and name exactly one next coherent capability migration.
- [x] 2.2 Confirm no migration-backlog entry belongs to reordering; leave
  entries owned by unmigrated capabilities in place.

## 3. Verify the migration

- [x] 3.1 Confirm the repository has one normative reordering contract, no dead
  references to the removed document, and no product behavior changes.
- [x] 3.2 Run strict OpenSpec validation and the repository's required final
  checks, fixing failures caused by the migration.
