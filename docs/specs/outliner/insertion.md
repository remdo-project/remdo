# Insertion

With a **[caret selection](./selection.md#selection-states)** or an **[inline text
selection](./selection.md#selection-states)**, `Enter` inserts new notes. The
selection is inside a single note, and actions apply to that note's text. Unless
stated otherwise, parent notes are expanded; folded and collapsed parent
behavior is called out explicitly (see [Folding](./folding.md)).

## Default behavior (caret selection)

1. **Start of note** – create a previous sibling immediately above. Children of
   the original note stay attached to it.
2. **Middle of note** – split into two siblings at the exact caret, including
   inside an inline container. The original note keeps the text **before** the
   caret; a new next sibling receives the text after the caret and all existing
   children. [Note IDs](./note-ids.md#creation), [Body](./body.md#core-behavior),
   [Folding](./folding.md#core-behavior), [List types](./list-types.md#checked-state),
   and [Links](./links.md#core-behavior) define how their owned state survives the split.
3. **End of note** – when the note already has children **and** the parent is
   expanded, create a new first child. Otherwise (no children or collapsed
   parent), insert a next sibling immediately below.

## Inline text selection

`Enter` first removes the selected text, then applies the caret rules above at
the resulting caret, so an inline text selection never has its own placement,
identity, or focus rules. Removal and insertion undo as one step.

When the selection covers the note's whole [content text](./note-model.md#definitions),
the emptied note takes the **end of note** rule rather than the start rule its
caret position would otherwise select, so one keystroke leaves one empty note
rather than two.

## Zoom boundary behavior

In a [subtree view](./zoom.md#visibility-and-editing-boundary), default
insertion still applies to the outline children except where it would place the
new note outside the [zoom boundary](./zoom.md#definitions); in those cases
insertion stays inside the [subtree](./note-model.md#definitions). A middle
split of the zoom root makes the trailing note its first child; the original
children follow that trailing note and become its children. `Enter` from the
[view header](./view-header.md) is defined by the view-header rules.

## Focus rules

1. **Start of note:** place the caret in the new sibling above so typing
   continues there.
2. **Middle of note:** place the caret at the start of the fresh trailing note.
3. **End of note:** place the caret at the start of the newly created note
   (child or sibling) so typing immediately fills it.

## Paste placement (caret selection)

When a paste inserts multiple notes, its placement follows the same
start/middle/end rules as `Enter`. Clipboard details (including how multi-line
plain text is interpreted and focus after paste) live in [Clipboard](./clipboard.md).
