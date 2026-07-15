## Why

`outliner-reordering` is the next capability selected for the gradual OpenSpec
migration. Moving its accepted keyboard-reordering contract establishes one
durable owner without changing product behavior.

## What Changes

- Add the accepted keyboard-reordering contract as the
  `outliner-reordering` OpenSpec capability.
- Clarify the shared selection terminology needed by reordering: structural
  selection is a selection kind, while a note range is the one-or-more-note
  operand resolved for structural commands.
- Remove `docs/outliner/reordering.md` as the former normative owner and update
  its inbound documentation links to the main spec.
- Mark `outliner-reordering` complete in the migration manifest and select one
  next capability.

## Capabilities

### New Capabilities

- `outliner-reordering`: Defines keyboard shortcuts, directional movement,
  target-note-range and subtree behavior, zoom boundaries, and no-op cases.

### Modified Capabilities

None.

## Impact

Documentation ownership moves from `docs/outliner/reordering.md` to
`openspec/specs/outliner-reordering/spec.md`. Inbound documentation links and
`openspec/MIGRATION.md` change. `docs/outliner/selection.md` remains the current
selection authority but is clarified together with its migration-backlog entry;
product code, APIs, dependencies, and runtime behavior do not change.
