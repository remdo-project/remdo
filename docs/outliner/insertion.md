# Insertion (Enter) Semantics

Defines how RemDo inserts new notes when `Enter` is pressed in **caret mode**.
This spec assumes the caret is inside a single note and actions apply to the
active note text. Unless stated otherwise, parent notes are expanded; folded and
collapsed parent behavior is called out explicitly (see [Folding](./folding.md)).
Structural mode still treats `Enter` as a no-op; see [Selection](./selection.md)
for mode definitions.

## Default behavior (caret mode)

1. **Start of note** – create a previous sibling immediately above. Focus moves
   to the new sibling so typing continues there. Children of the original note
   stay attached to it.
2. **Middle of note** – split into two siblings at the caret. Text **before**
   the caret becomes a new sibling inserted immediately above the original; the
   original note keeps the text after the caret and all of its children (the
   note after the caret remains the parent of its subtree).
3. **End of note** – when the note already has children **and** the parent is
   expanded, create a new first child. Otherwise (no children or collapsed
   parent), insert a next sibling immediately below. Focus always moves to the
   newly created note.

## Zoom boundary behavior (caret mode)

When zoom is active, default insertion still applies except where it would place
the new note outside the zoom boundary. In those cases, insertion stays inside
the zoom root subtree:

1. **Caret in zoom root at start** – insert a new first child.
2. **Caret in zoom root in middle** – split the zoom root so text before the
   caret becomes a new first child; the zoom root keeps trailing text and
   existing children.
3. **Caret in zoom root at end** – insert a new first child.
4. For all other notes inside the zoom boundary, use default start/middle/end
   behavior.

## Focus rules

1. **Start of note:** place the caret in the new sibling above so typing
   continues there.
2. **Middle of note:** keep the caret in the original note (the one after the
   caret) so the trailing text remains the active line.
3. **End of note:** place the caret at the start of the newly created note
   (child or sibling) so typing immediately fills it.
4. In zoom-boundary insertion at the zoom root, focus follows the same
   start/middle/end policy above (child for start/end, zoom root for middle).

## Paste placement (caret mode)

When a paste inserts multiple notes, its placement follows the same
start/middle/end rules as `Enter`. Clipboard details (including how multi-line
plain text is interpreted and focus after paste) live in
[Clipboard](./clipboard.md).
