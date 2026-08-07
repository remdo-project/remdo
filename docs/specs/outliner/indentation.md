# Indentation

Indent and outdent change the nesting of
[target note ranges](./selection.md#note-ranges) while preserving their order.

## Input bindings

- **Indent:** `Tab`
- **Outdent:** `Shift+Tab`

## Target resolution

A [caret or inline text selection](./selection.md#selection-states) in an [outline selection region](./selection.md#selection-states) targets the
[editor note](./note-model.md#note-kinds) that owns the region as a one-note target note range. [Body](./body.md#selection-and-structural-targeting) owns the
mapping from a body selection region to its editor note.

## Focus handling

For a resolved target note range, the editor handles the input and retains focus
even when the requested operation leaves the outline unchanged.

## Indent

Indenting a target note range appends the complete range as the last children of
its immediate preceding sibling. Without a preceding sibling, the outline
remains unchanged.

## Outdent

Outdenting a target note range moves the complete range immediately after its
former parent. A top-level range remains unchanged.

## Zoom boundary

In a [subtree view](./zoom.md#visibility-and-editing-boundary), indent and
outdent apply only if the complete result remains inside the
[zoom boundary](./zoom.md#definitions); otherwise, the outline remains unchanged.
