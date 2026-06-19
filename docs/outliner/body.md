# Note Body

## Purpose

A **body** is an optional rich-text region attached to a single note, shown
below the note's [content](./concepts.md). It is a self-contained editing region
with its own selection that stays separate from the structural note tree.

## Core behavior

1. **Add gesture.** `Shift+Enter` on a note adds a body below that note's content
   and moves the caret into it. If the note already has a body, the gesture moves
   the caret to the start of the existing body instead of adding another.
2. **Ownership.** A note has at most one body, and a body belongs to that one
   note.
3. **Visually distinct.** A body renders set apart from the note's content.
4. **Inline formatting.** Body text supports the same key-driven inline
   formatting as note content; there is no separate formatting UI.

## Selection and navigation

A body is a self-contained selection world. When a note is selected structurally,
its body is included as part of that note; the ladder (see
[Selection](./selection.md)) never selects a body's text on its own, and a body's
selection never extends out into the note tree.

Within that world, keys behave as follows:

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

`Backspace` at the start of a non-empty body is a no-op — it never merges the
body into the note above — so a body is removed only by emptying it first.

## Node model

A body is a `NoteBodyNode` (a Lexical `ElementNode`) held by a dedicated
**body-wrapper** `ListItemNode` placed immediately after the note's content item,
before any children-wrapper — mirroring the children-wrapper pattern so a note's
nodes read as `[ content item, body-wrapper?, children-wrapper? ]`. Because the
body lives in the document's own tree as a normal element, collaboration, undo,
and persistence apply to it exactly as they do to note content (an `ElementNode`
syncs through `@lexical/yjs`; only decorator nodes are opaque). A body-wrapper is
never a note: it carries no `noteId` and is excluded from every note-enumeration
path (navigation, the ladder, schema normalization, range selection, deletion).

## References

1. Lexical custom nodes: <https://lexical.dev/docs/concepts/nodes>
