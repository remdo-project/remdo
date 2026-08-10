# Clipboard

Cut, copy, and paste operate on RemDo notes, including placement from a caret.
[Note IDs](./note-ids.md) owns identity changes, and [Links](./links.md) owns
note-link identity across clipboard and persistence boundaries plus generic-URL
authoring from pasted text.

## Structural selection

- Copy duplicates the selected notes (including their
  [subtrees](./note-model.md#definitions) and each note's [body](./body.md)) and leaves the document unchanged.
- Copy captures the notes as they are at copy time; later edits to the
  originals do not change what gets pasted.
- Cut creates a **pending cut** from the
  [selected note range](./selection.md#note-ranges). Its notes stay in place until paste moves them.
- Any edit inside the pending cut before pasting, including a remote edit,
  cancels the cut so edits stay where they were made.
- After creating a pending cut, the caret moves to the start of the range's
  first note in [document order](./note-model.md#definitions).
- Pasting while a [selected note range](./selection.md#note-ranges) is active
  replaces that selection with the pasted notes.
- Pasting a pending cut moves its notes to the new location. If the cut is no
  longer valid, paste does nothing.
- A pending cut can be pasted once; after a successful paste it is cleared.
- If you try to paste inside the pending cut, nothing happens and the cut
  remains pending.
- Starting a new copy/cut, or pasting unrelated content, cancels the pending cut.
- Pasting a copied note **outside** RemDo (plain text) includes each note's own
  text, then its body text on the following line(s), then its sub-notes — the
  order the note reads on screen.

## Inline text selection (single note)

- Single-line plain text replaces the selected text, except a RemDo-owned note
  URL or a destination accepted by [generic URL authoring](./links.md#generic-url-authoring)
  creates the corresponding link whose label remains the selected text.
- Multi-line plain text always inserts notes, even when the selection is inline.
  The first line replaces the selected text; remaining lines become new child
  notes inserted before existing children.

## Caret-position placement (collapsed selection)

- Single-line plain text pastes into the note's text at the caret. Only an
  automatic-recognition candidate becomes a generic link; other scheme-less
  web input remains text, as defined in
  [Links](./links.md#generic-url-recognition).
- Pasting notes or multi-line plain text inserts multiple notes (one line per
  note for plain text).
- Placement follows the caret-position rules from [Insertion](./insertion.md).
- After a multi-note paste, focus lands at the end of the last inserted note.
