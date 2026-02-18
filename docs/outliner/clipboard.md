# Clipboard

## Purpose

Define user-visible cut/copy/paste behavior for RemDo notes, including how
paste placement depends on caret position. Note-id identity implications live in
[Note IDs](./note-ids.md); note-link `docId` clipboard/persistence rules
live in [Links](./links.md).

## Structural selections (note range)

- Copy duplicates the selected notes (including their subtrees) and leaves the
  document unchanged.
- Copy captures the notes as they are at the moment you copy; later edits to the
  originals do not change what gets pasted.
- Cut prepares the selected notes to be moved; they stay in place until you
  paste them elsewhere.
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

## Inline selection (single note)

- Single-line plain text replaces the selected text, as in a normal text editor.
- Multi-line plain text always inserts notes, even when the selection is inline.
  The first line replaces the selected text; remaining lines become new child
  notes inserted before existing children. This is a pragmatic choice (keeps
  structure intact) and may change as paste UX is refined.

## Caret-position placement (collapsed selection)

- Single-line plain text pastes into the note's text at the caret, replacing
  any inline selection as normal.
- Pasting notes or multi-line plain text inserts multiple notes (one line per
  note for plain text).
- Placement follows the caret-position rules from [Insertion](./insertion.md),
  mirroring `Enter`.
- After a multi-note paste, focus lands at the end of the last inserted note.

## Identity

Identity implications:

- Note `noteId` regen/preserve rules are defined in [Note IDs](./note-ids.md).
- Note-link `docId` clipboard behavior is defined in [Links](./links.md).
