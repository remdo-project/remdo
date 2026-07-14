## Why

`list-types` is the first product capability selected for the gradual OpenSpec
migration. Moving its accepted contract now exercises the migration workflow
while keeping one normative owner and making no product behavior change.

## What Changes

- Add the accepted list-type and checked-state contract as the `list-types`
  OpenSpec capability.
- Remove `docs/outliner/list-types.md` as the former normative owner and update
  its inbound documentation links to the main spec.
- Mark `list-types` complete in the migration manifest and select one next
  capability.

## Capabilities

### New Capabilities

- `list-types`: Defines supported list types, level-local conversion, persistent
  checked state, recursive checked-state changes, multi-note targeting, and the
  checked-state keyboard command.

### Modified Capabilities

None.

## Impact

Documentation ownership moves from `docs/outliner/list-types.md` to
`openspec/specs/list-types/spec.md`. Inbound links in the outliner documentation
and `openspec/MIGRATION.md` change; product code, APIs, dependencies, and runtime
behavior do not.
