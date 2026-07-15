## Why

The indentation spec currently says that an inline text selection inside a note
body targets its owning note, but the maintained selection model intentionally
keeps such a selection body-local. Correct the contract to match existing
behavior without changing the product.

## What Changes

- Limit owner-note resolution to carets in note content or a body and inline
  text selections in note content.
- Keep structural selections resolving to their selected note ranges.
- Exclude inline body selections from the indentation target-resolution
  requirement and scenario.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `outliner-indentation`: Correct which non-structural selections resolve to a
  target note range.

## Impact

Only `openspec/specs/outliner-indentation/spec.md` changes. Runtime behavior,
tests, APIs, and dependencies remain unchanged.
