# Clipboard

## Purpose

Define user-visible cut/copy/paste behavior for RemDo notes, including how
paste placement depends on caret position. Identity implications live in
[Note IDs](./note-ids.md).

## Structural selections (note range)

- Copy duplicates the selected notes (including their subtrees) and leaves the
  document unchanged.
- Copy captures the notes as they are at the moment you copy; later edits to the
  originals do not change what gets pasted.
- Cut prepares the selected notes to be moved; they stay in place until you
  paste them elsewhere.
- Multi-line plain text always inserts notes, even when you have a text
  selection inside a single note.
- If you edit cut notes before pasting, the pending cut is canceled so the
  edits stay where you made them. This keeps copy and cut predictable instead
  of pasting a different version than the one you can see.
- After a structural cut, the selection collapses to the visual start so you
  can keep editing with a clear caret position.
- Pasting while a note range is selected replaces that selection with the
  pasted notes.
- Pasting after a cut moves the cut notes to the new location. If the cut is no
  longer valid (for example, the cut notes were edited), paste does nothing.
- A cut can be pasted once; after a successful paste the cut is cleared.
- If you try to paste into the cut notes or their descendants, nothing happens
  and the cut remains pending.
- Starting a new copy/cut, or pasting unrelated content, cancels the pending
  cut.

## Caret-position placement (collapsed selection)

- Single-line plain text pastes into the note's text at the caret, replacing
  any inline selection as normal.
- Pasting notes or multi-line plain text inserts multiple notes (one line per
  note for plain text).
- Placement follows the caret-position rules from [Insertion](../insertion.md),
  mirroring `Enter`:
  - Start of note: insert pasted notes as previous siblings (above).
  - Middle of note: split the note at the caret (prefix becomes a new sibling
    above; suffix stays in the original note) and insert pasted notes between
    the split notes.
  - End of note: if the note has children and the parent is expanded, insert
    pasted notes as the first child; otherwise insert as next siblings below.
- After a multi-note paste, focus lands at the end of the last inserted note.

## Identity

Identity implications (regen vs. preserve `noteId` values) are defined in
[Note IDs](./note-ids.md).
