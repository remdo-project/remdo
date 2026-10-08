# Inline formatting

The selection toolbar and Inline code shortcut format eligible selected text.

## Eligible selection

A resolved, editable [inline text selection](./selection.md#selection-states) containing formattable text is eligible.
Formatting is unavailable during composition or while an [editor popup](./popups.md) is open.

## Formatting

The compact row offers Bold, Italic, Underline, and Inline code, in that order.
Buttons expose all, some, or none coverage and their platform shortcuts.

In the editor, `Cmd+E` on macOS or `Ctrl+E` elsewhere toggles Inline code for the
eligible selection, even when the row is hidden or absent.

An all-on format toggles off; mixed or off toggles uniformly on. Other formats,
styles, links, tokens, and unselected text retain their content and semantics.

Pointer activation applies only on a completed press to the current eligible
range. A changed or invalidated pressed target cancels the action and refreshes
the row; dragging onto or away from a button applies nothing.

Row activation and the Inline code shortcut preserve editor focus, selection,
native highlight, and direction. Each is an independent undo step.

## Presence and placement

The row appears automatically after an eligible selection settles, without
moving focus. It hides during selection dragging or when focus leaves the
editor.

On hosts with a coarse primary pointer and no hover, the floating row is absent;
native touch selection and the [mobile toolbar](./mobile-toolbar.md) remain the editing surfaces.

The row anchors horizontally to a visible selected text line, independent of
selection direction, and clears all visible selected text. It prefers above,
flips below when needed, and fits within the editor's visible horizontal bounds,
viewport, and clipping scroll containers.

Content, scroll, and viewport changes refresh placement. With no fitting
position or no selected text visible in the editing area, the row hides.
