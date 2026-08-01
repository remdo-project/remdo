# Indentation

Indent and outdent change the nesting of
[target note ranges](./selection.md#note-ranges) while preserving their order.

## Keyboard indentation

`Tab` indents the current target note range, and `Shift+Tab` outdents it.

A [caret or inline text selection](./selection.md#selection-states) targets the
[editor note](./note-model.md#note-kinds) that owns its region as a one-note
target range. [Body](./body.md#selection-and-structural-targeting) owns the
mapping from a body region to its editor note.

For a resolved target note range, the editor handles `Tab` or `Shift+Tab` and
retains focus even when the requested operation leaves the outline unchanged.

## Indent

Indenting a target note range appends the complete range as the last children of
its immediate preceding sibling. Without a preceding sibling, the outline
remains unchanged.

## Outdent

Outdenting a target note range moves the complete range immediately after its
former parent. A top-level range remains unchanged.

## Zoom boundary

When [zoom](./zoom.md) is active, indent and outdent apply only if
the complete result remains inside the zoom boundary; otherwise, the outline
remains unchanged.
