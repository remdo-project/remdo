# Desktop editing toolbar

The desktop toolbar exposes document-editing actions above the outline. It uses
the current selection and history of the [open document](./open-document.md); each
action's owner defines its operation.

## Presence and layout

The toolbar is present in an open document's editing view on devices outside the
[touch toolbar's presence](./mobile-toolbar.md#presence). It remains visible when
there is no eligible formatting selection. Home and an unavailable document have
no editing toolbar.

The row sits beside the [location heading](./location-header.md), using bare
icons without a surrounding background or border. When space is tight, it
stacks below the heading and above its contents. Its control groups appear in
this order:

1. Undo, Redo.
2. Bold, Italic, Underline, Inline code, per [Inline formatting](./inline-formatting.md).
3. Outdent, Indent, per [Indentation](./indentation.md).
4. Move up, Move down, per [Reordering](./reordering.md).
5. Toggle checked, per [List types](./list-types.md#toggling).

At narrow widths the row scrolls horizontally within its available width;
controls remain keyboard reachable without widening the page.

## Targeting and availability

Structural actions use the current selection's
[target note range](./selection.md#note-ranges), including a body's owning note
per [Body](./body.md#selection-and-structural-targeting). A
[location-header selection](./location-header.md#structural-boundary) supplies no
structural target. An inapplicable structural action is a no-op.

Read-only editing disables every control. Undo and Redo also reflect
document-history availability. Formatting controls reflect eligible selected
text while focus is in the editor or toolbar, including all, some, or none
format coverage; otherwise they remain visible and disabled.
[Inline formatting](./inline-formatting.md#eligible-selection) owns composition
and popup exclusions.

## Interaction

Pointer and keyboard activation use the same operations. Activating a control
returns focus to the editor, retaining the operation's selection context.
Formatting follows the
[selection-preservation and press-cancellation rules](./inline-formatting.md#formatting).

The toolbar uses the WAI-ARIA toolbar pattern: Left and Right arrows move
between enabled controls, Home and End reach the first and last enabled controls,
Enter and Space activate a control, and Tab leaves the toolbar. Controls expose
their action names and applicable platform shortcuts, matching the
[keyboard reference](./keyboard-reference.md#platform).
