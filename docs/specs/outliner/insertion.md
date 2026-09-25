# Insertion

Insertion creates notes from `Enter` and from
[open document session](./document-session.md) consumers.

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
   children.
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
[location header](./location-header.md) is defined by the location-header rules.

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

## Session insertion

Appending children to an [open document session](./document-session.md) note
adds a described subtree as that note's last children; the
[document root](./note-model.md#definitions) receives top-level notes. Each
described note supplies its plain text and optionally its checked state, its
children, and the list type of those children. A line break in any described
text makes the insertion
[ineligible](./document-session.md#operations-and-ownership).

- The operation resolves with the directly inserted notes'
  [`noteId`](./note-ids.md#creation) values in order, or with none for an empty
  description.
- A described checked state applies to its own note only.
- The parent's existing child list keeps its type. A missing child list,
  including one created for a described note without a described list type,
  takes the type of the list containing its parent.
- Focus and selection are unchanged.
- The insertion is one local update, so undo never removes part of it.

## Future

- Add session placement as first children and as siblings before or after an
  editor note, named `prependChildren`, `insertBefore`, and `insertAfter`
  alongside `appendChildren`, when a consumer needs them.
