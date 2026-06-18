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

Within that world, caret and selection keys behave as follows:

1. **Vertical nav skips it.** `Up`/`Down` caret movement between notes never stops
   in a body.
2. **Caret is trapped.** Arrow keys keep the caret inside the body, stopping at
   its boundaries.
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

`Backspace` at the start of a non-empty body is a no-op (the caret is trapped at
the boundary; see *Selection and navigation*), so a body is removed only by
emptying it first.

---

## Node-model fork (not yet settled)

Everything above is settled behavior. The node model below is a recommendation,
not a settled choice.

Body content is collaborative like any other editor content, so the node model
must put body text in the document's own Yjs-bound tree.

Verified constraint: `@lexical/yjs` treats a `DecoratorNode` as opaque
(`CollabDecoratorNode`) — it syncs the node's existence and serialized props but
not the internal state of a nested sub-editor. A `LexicalNestedComposer`
sub-editor carries its own Yjs binding the parent collab plugin does not manage.

1. **Decorator node + nested sub-editor.** Isolation is structural and free, but
   the sub-editor's own Yjs binding sits outside document collaboration, so body
   text would need a separate binding (or lose live collab). Separate undo stack;
   heaviest to build.
2. **Custom non-note `ElementNode` block inside the note's `ListItemNode`**
   (current lean). One editor / one Yjs binding → collaboration, undo,
   formatting, and persistence come for free. Cost: the block must be actively
   excluded from every note-enumeration path (vertical nav, ladder,
   schema/normalization, range selection, deletion-merge).
3. **Second flagged paragraph inside the note** (rejected). Lightest, but weakest
   isolation; too easily mistaken for note content; fights the schema.

## References

1. Lexical custom nodes: <https://lexical.dev/docs/concepts/nodes>
2. Lexical nested composer:
   <https://lexical.dev/docs/api/modules/lexical_react_LexicalNestedComposer>
