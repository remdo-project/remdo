# Clipboard

Cut, copy, and paste operate on RemDo notes, including placement from a caret.
[Note IDs](./note-ids.md) owns identity changes, and [Links](./links.md) owns
note-link identity across clipboard and persistence boundaries.

## Structural selection

- Copy and cut capture the selected notes (including their
  [subtrees](./note-model.md#definitions) and each note's [body](./body.md)) as
  they are at the time of the operation. Later source edits do not change the
  clipboard data.
- Copy leaves the document unchanged.
- Cut removes the [selected note range](./selection.md#note-ranges)
  immediately. Focus follows the [structural deletion](./deletion.md#structural-selection)
  order.
- Internal structural copy data omits note identity. Cut data records its source
  document identity and retains note identity. [Note IDs](./note-ids.md#clipboard)
  owns how paste resolves those identities before the common insertion path.
- The first valid same-document cut paste at the unchanged deletion focus
  restores the recorded source gap exactly. After focus moves, normal
  [Insertion](./insertion.md) placement applies.
- Pasting while a [selected note range](./selection.md#note-ranges) is active
  replaces that selection with the pasted notes.
- Clipboard data can be pasted repeatedly. RemDo does not keep a pending cut or
  wait for a paste before removing cut notes.
- Pasting into a note body follows the [Body clipboard contract](./body.md#clipboard).
- Copying or cutting notes supplies plain text for pasting **outside** RemDo:
  each note's own text, then its body text on the following line(s), then its
  sub-notes — the order the note reads on screen.

## Inline text selection (single note)

- Single-line plain text replaces the selected text, as in a normal text editor.
- Multi-line plain text always inserts notes, even when the selection is inline.
  The first line replaces the selected text; remaining lines become new child
  notes inserted before existing children.

## Caret-position placement (collapsed selection)

- Single-line plain text pastes into the note's text at the caret.
- Pasting notes or multi-line plain text inserts multiple notes (one line per
  note for plain text).
- Placement follows the caret-position rules from [Insertion](./insertion.md).
- When the document's only note is empty, pasting notes replaces that empty
  note instead of leaving it beside the pasted notes.
- After a multi-note paste, focus lands at the end of the last inserted note.
