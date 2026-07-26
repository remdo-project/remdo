# Indentation

This specification defines indent and outdent operations on target note ranges,
including keyboard targeting, structural transformations, zoom boundaries, and
focus at structural no-ops. Selection kinds and note ranges are defined by
[Selection](../../outliner/selection.md).

## Keyboard indentation

`Tab` indents the current target note range, and `Shift+Tab` outdents it.

A caret or inline text selection targets the
[editor note](../../outliner/concepts.md#note-kinds) that owns its region as a
one-note target range. A structural selection targets its selected note range.

When a target note range resolves, the editor handles `Tab` or `Shift+Tab` and
retains focus even when the requested structural operation leaves the outline
unchanged.

## Indent

Indenting a target note range makes the complete range the children of its
immediate preceding sibling. The range moves as one unit, preserving its order
and internal structure. Without a preceding sibling, the outline remains
unchanged.

## Outdent

Outdenting a target note range moves the complete range up one level,
immediately after its former parent. The range moves as one unit, preserving its
order and internal structure. A top-level range remains unchanged.

## Zoom boundary

When [zoom](../../outliner/zoom.md) is active, indent and outdent apply only
when the complete result remains inside the zoom boundary. An operation that
would cross the boundary leaves the outline unchanged.
