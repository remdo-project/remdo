## Context

The accepted keyboard-reordering contract currently lives in
`docs/outliner/reordering.md`. Focused command and keymap tests cover its
shortcuts, directional fallback cascade, note-range movement, subtree
integrity, zoom boundaries, and no-op cases. The migration tracker names
reordering as the next capability.

## Goals / Non-Goals

**Goals:**

- Move the complete accepted reordering contract to one durable
  `outliner-reordering` spec.
- Clarify the shared selection terminology that reordering consumes without
  prematurely creating a partial selection capability.
- Preserve cross-capability links and the existing pointer-reordering future
  direction.
- Remove the legacy owner and advance the migration tracker atomically.

**Non-Goals:**

- Change keyboard, selection, movement, or zoom behavior.
- Describe commands, Lexical nodes, plugins, or tree-operation helpers.
- Migrate selection, zoom, note structure, or mobile-toolbar capabilities.
- Add pointer drag-and-drop reordering.

## Decisions

### Express movement as one directional fallback cascade

The spec defines one ordered cascade shared by move-up and move-down, with
direction-specific placement only where the outcomes differ. This preserves
the observable one-step model without encoding the implementation helpers that
perform it.

Alternative: specify each direction as an independent algorithm. Rejected
because it duplicates the shared priority and no-op rules and makes drift more
likely.

### Keep cross-capability terms with their current owners

The reordering spec consumes selection and zoom terms without taking ownership
of either capability. Selection distinguishes caret, inline-text, and
structural selection kinds. A structural selection has a selected note range;
reordering resolves a target note range from a caret, an inline text range in
note content, or that selected note range. Both ranges contain one or more
contiguous sibling notes together with their subtrees.

The terminology is clarified at the current selection authority and recorded
in the migration backlog until the selection capability migrates. Links
continue to the authoritative `docs/outliner/` sections in the meantime.

Alternative: copy the relevant selection and zoom rules into reordering.
Rejected because that would create competing definitions during migration.

Alternative: start a separate OpenSpec change containing a partial selection
capability. Rejected because the terminology clarification changes no behavior
and would create a misleading durable owner before the complete selection
contract is ready to migrate.

### Preserve pointer reordering only as a future direction

Pointer drag-and-drop is not accepted product behavior. The main spec retains
it as a brief `Future` entry rather than a requirement, matching the durable-doc
policy without implying implementation work.

## Risks / Trade-offs

- The fallback cascade could be weakened while being condensed. → Compare the
  delta against both the legacy document and focused reordering tests before
  removing the old owner.
- Links could keep targeting the removed document. → Search the repository and
  run Markdown validation after the ownership move.
- Cross-capability terminology could drift before selection and zoom migrate.
  → Clarify the current selection owner, track its intended destination in
  the migration backlog, and link at first use.
