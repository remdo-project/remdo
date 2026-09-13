# Clipboard

Cut, copy, and paste operate on RemDo notes, including placement from a caret.
[Note IDs](./note-ids.md) owns identity changes, and [Links](./links.md) owns
note-link identity across clipboard and persistence boundaries.

## Incoming content

After compatible internal content and [owned note-URL handling](./links.md#core-behavior), paste prefers
HTML, then plain text. Rich content retains its supported inline formatting,
links, and list hierarchy. Leading unlabeled list nesting is promoted to the
current level.
List items define note boundaries. Outside lists, separate imported blocks become
separate notes; a single block inserts inline.
Hard line breaks remaining inside imported [content text](./note-model.md#definitions) become spaces,
including breaks from preformatted text. This normalization leaves [body](./body.md) content
unchanged.

Pasting into a body follows the [Body clipboard contract](./body.md#clipboard).

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
- Pasting while a [selected note range](./selection.md#note-ranges) is active
  replaces that selection with the pasted notes.
- Clipboard data can be pasted repeatedly. RemDo does not keep a pending cut or
  wait for a paste before removing cut notes.
- Copying or cutting notes supplies plain text for pasting **outside** RemDo:
  each note's own text, then its body text on the following line(s), then its
  sub-notes — the order the note reads on screen.

## Inline text selection (single note)

- Single-line plain text replaces the selected text, as in a normal text editor.
- Multi-line plain text always inserts notes, even when the selection is inline.
  The first line replaces the selected text; remaining lines become new child
  notes inserted before existing children.

Rich notes pasted over an inline selection replace that text with the first
note's content text. That note's children, followed by the remaining pasted
notes, become first children before existing children, retaining their subtrees.
If any copied note has a body, the whole payload instead uses its line-separated
plain-text representation and follows the plain-text rule above.

## Caret-position placement (collapsed selection)

- Single-line plain text pastes into the note's text at the caret.
- Pasting notes or multi-line plain text inserts multiple notes (one line per
  note for plain text).
- Placement follows the caret-position rules from [Insertion](./insertion.md).
- When the document's only note is empty, pasting notes replaces that empty
  note instead of leaving it beside the pasted notes.
- After a multi-note paste, focus lands at the end of the last inserted note.
