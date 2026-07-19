## 1. Complete the ownership migration

- [x] 1.1 Add focused automated coverage that proves a resolvable `Tab` or
  `Shift+Tab` structural no-op keeps focus inside the editor.
- [x] 1.2 Remove the resolved `IndentationPlugin` boundary-key decision from
  `docs/legacy-backlog.md` without changing the keyboard handler.
- [x] 1.3 Remove `docs/outliner/note-structure-rules.md` and update every inbound
  documentation and code-comment link to the main `outliner-indentation` spec,
  preserving links to the existing reordering and adjacent capability owners.
- [x] 1.4 Confirm the removed document contains no accepted rule absent from the
  indentation spec or an adjacent authoritative owner.

## 2. Advance migration tracking

- [x] 2.1 Update `openspec/MIGRATION.md` to record
  `outliner-indentation` as complete and name exactly one next coherent
  capability migration.
- [x] 2.2 Confirm no migration-backlog entry belongs to indentation; leave
  entries owned by unmigrated capabilities in place.

## 3. Verify the migration

- [x] 3.1 Confirm the repository has one normative indentation contract, no
  dead references to the removed document, and no runtime behavior changes.
- [x] 3.2 Run strict OpenSpec validation and the repository's required final
  checks, fixing failures caused by the migration.
