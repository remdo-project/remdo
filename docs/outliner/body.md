# Note Body

## Purpose

A **body** is an optional rich-text region attached to a single note, shown
below the note's [content](./concepts.md). It is itself a restricted kind of note
owned by its editor note (see [Concepts](./concepts.md#note-kinds)).

## Core behavior

1. **Add gesture.** `Shift+Enter` on a note adds a body below that note's content
   and moves the caret into it. If the note already has a body, the gesture moves
   the caret to the start of the existing body instead of adding another.
2. **Ownership.** A note has at most one body, and a body belongs to that one
   note. The body is content the note owns, so it travels with the note —
   through indent/outdent, reorder, structural delete, and
   [clipboard](./clipboard.md) copy/cut/paste.
3. **Visually distinct.** A body renders set apart from the note's content.
4. **Inline content.** Body text supports the same key-driven inline content as
   note content — inline formatting (no separate formatting UI) and `@` note
   links (see [Links](./links.md)).

## Selection and navigation

For selection, a note's content and its body are two distinct **regions**:

- An inline selection lives within exactly one region — one note's content, or
  one body.
- A selection spanning a note's content and its own body is structural, limited
  to that single note (a note is never selected structurally without its body).
- Any selection crossing two notes — including one with an endpoint inside a
  body — is structural and snaps to whole notes (see [Selection](./selection.md)).
- The ladder never selects a body's text by itself.

Within a body, keys behave as follows:

1. **Arrows are one-way.** Caret arrow navigation never enters a body from
   outside: it is transparent to vertical movement, which lands exactly where it
   would if the body were not there (the next or previous note in document
   order). But once the caret is inside a body, any arrow that crosses a boundary
   leaves it. The only ways into a body are the add/focus gesture and clicking.
2. **`Enter` inserts a line break.** Inside a body, `Enter` adds a newline (the
   body is multi-line), rather than creating a note as it does in note content.
3. **`Cmd/Ctrl+A` is local.** Inside a body it selects that body's text only and
   never advances the selection ladder.

## Lifecycle

1. **Created empty.** `Shift+Enter` commits the body immediately; an empty body
   is kept.
2. **Deleted when empty.** `Backspace` or `Delete` on an empty body removes it
   and returns the caret to its note. Emptying a body's last character only
   empties it — the next `Backspace`/`Delete` removes it.
3. **Select-all delete.** Selecting all of a body's text and pressing
   `Delete`/`Backspace` removes the body in one step.
4. **Undo restores it.** Undoing a body deletion restores the body and its text
   as a single step.

`Backspace` at the start of a non-empty body is a no-op.

## Note merge

When two notes merge into one (see [Deletion](./deletion.md) for when a
`Backspace`/`Delete` joins notes), their bodies resolve by count:

1. **Neither has a body.** The notes merge as usual.
2. **Exactly one has a body.** The merge proceeds and the surviving note keeps
   that body.
3. **Both have a body.** The merge is a no-op.
