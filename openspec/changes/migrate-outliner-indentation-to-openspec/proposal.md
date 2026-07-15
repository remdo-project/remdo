## Why

`outliner-indentation` is the next capability selected for the gradual OpenSpec
migration. Moving its accepted indent and outdent contract establishes one
durable owner without changing product behavior.

## What Changes

- Add the accepted indent and outdent contract as the
  `outliner-indentation` OpenSpec capability.
- Preserve the current keyboard boundary behavior: `Tab` and `Shift+Tab` stay
  inside the editor when a target note range exists, including when the
  structural operation is a no-op.
- Remove `docs/outliner/note-structure-rules.md` as the former normative owner
  and update inbound documentation links to the main spec.
- Mark `outliner-indentation` complete in the migration manifest and select one
  next capability.

## Capabilities

### New Capabilities

- `outliner-indentation`: Defines keyboard inputs, target-note-range and
  subtree behavior, valid indent and outdent transformations, zoom boundaries,
  focus preservation, and no-op cases.

### Modified Capabilities

None.

## Impact

Documentation ownership moves from
`docs/outliner/note-structure-rules.md` to
`openspec/specs/outliner-indentation/spec.md`. Inbound documentation links,
`docs/todo.md`, and `openspec/MIGRATION.md` change. Product code, APIs,
dependencies, and runtime behavior do not change.
