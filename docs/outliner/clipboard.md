# Clipboard

## Purpose

Define user-visible cut/copy/paste behavior for RemDo notes, including how
paste placement depends on caret position. Note-id identity implications live in
[Note IDs](./note-ids.md); note-link `docId` clipboard/persistence rules
live in [Links](./links.md).

## Structural selection

- Copy duplicates the selected notes (including their subtrees and each note's
  [body](./body.md)) and leaves the document unchanged.
- Copy captures the notes as they are at copy time; later edits to the
  originals do not change what gets pasted.
- Cut prepares the selected notes to be moved; they stay in place until you
  paste them elsewhere.
- If you edit anything inside the pending cut boundary before pasting, the cut
  is canceled so edits stay where they were made.
- After a structural cut, the selection collapses to the visual start so you
  can keep editing with a clear caret position.
- Pasting while a selected note range is active replaces that selection with the
  pasted notes.
- Pasting after a cut moves the cut notes to the new location. If the cut is no
  longer valid, paste does nothing.
- A cut can be pasted once; after a successful paste the cut is cleared.
- If you try to paste into the cut notes or their descendants, nothing happens
  and the cut remains pending.
- Starting a new copy/cut, or pasting unrelated content, cancels the pending
  cut.
- Pasting a copied note **outside** RemDo (plain text) includes each note's own
  text, then its body text on the following line(s), then its sub-notes — the
  order the note reads on screen.

## Inline selection (single note)

- Single-line plain text replaces the selected text, as in a normal text editor.
- Multi-line plain text always inserts notes, even when the selection is inline.
  The first line replaces the selected text; remaining lines become new child
  notes inserted before existing children.

## Caret-position placement (collapsed selection)

- Single-line plain text pastes into the note's text at the caret.
- Pasting notes or multi-line plain text inserts multiple notes (one line per
  note for plain text).
- Placement follows the caret-position rules from [Insertion](./insertion.md).
- After a multi-note paste, focus lands at the end of the last inserted note.
