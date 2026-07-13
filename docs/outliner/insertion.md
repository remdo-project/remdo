# Insertion (Enter) Semantics

Defines how RemDo inserts new notes when `Enter` is pressed in **caret mode**
(mode definitions in [Selection](./selection.md)).
This spec assumes the caret is inside a single note and actions apply to the
active note text. Unless stated otherwise, parent notes are expanded; folded and
collapsed parent behavior is called out explicitly (see [Folding](./folding.md)).

## Default behavior (caret mode)

1. **Start of note** – create a previous sibling immediately above. Children of
   the original note stay attached to it.
2. **Middle of note** – split into two siblings at the caret. Text **before**
   the caret becomes a new sibling inserted immediately above the original; the
   original note keeps the text after the caret and all of its children.
3. **End of note** – when the note already has children **and** the parent is
   expanded, create a new first child. Otherwise (no children or collapsed
   parent), insert a next sibling immediately below.

## Zoom boundary behavior (caret mode)

When [zoom](./zoom.md) is active, default insertion still applies to the outline
children except where it would place the new note outside the zoom boundary; in
those cases insertion stays inside the subtree. The current location is the
[view header](./zoom.md#view-header), not an outline note, so `Enter` there adds
a first child rather than splitting a row (see the view-header rules).

## Focus rules

1. **Start of note:** place the caret in the new sibling above so typing
   continues there.
2. **Middle of note:** keep the caret in the original note (the one after the
   caret) so the trailing text remains the active line.
3. **End of note:** place the caret at the start of the newly created note
   (child or sibling) so typing immediately fills it.
4. `Enter` in the [view header](./zoom.md#view-header) places the caret in the
   new first child.

## Paste placement (caret mode)

When a paste inserts multiple notes, its placement follows the same
start/middle/end rules as `Enter`. Clipboard details (including how multi-line
plain text is interpreted and focus after paste) live in
[Clipboard](./clipboard.md).
