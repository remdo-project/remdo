# Note Body

## Purpose

A **body** is an optional rich-text region attached to a single note, shown
below the note's [content](./concepts.md). It is a self-contained editing region
with its own selection that stays separate from the structural note tree.

## Core behavior

1. **Add gesture.** `Shift+Enter` on a note adds a body below that note's content
   and moves the caret into it.
2. **Ownership.** A body belongs to one note; any note may have one.
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

Removing all text from a body deletes the body.

---

## Open decisions (not yet settled)

Everything above is settled behavior. The items below are unresolved; answering
them should mostly **add** to the sections above rather than change them.

1. **Cardinality.** One body per note, or many? `Shift+Enter` when a body already
   exists → focus the existing one vs. add another. (Affects *Add gesture* and
   *Ownership*.)
2. **Live collaboration inside the body** at launch, or a follow-up? Biggest scope
   lever; drives the node-model fork below.
3. **Persistence / export.** How a body renders in Markdown/clipboard export
   (blockquote, indented text, omitted for now). (Adds an *Export* section.)
4. **Empty-body lifecycle.** Does `Shift+Enter` commit an empty body immediately,
   or is a body persisted only once non-empty? (Refines *Lifecycle*.)

### Node-model fork (implementation, pending the decisions above)

Verified constraint: `@lexical/yjs` treats a `DecoratorNode` as opaque
(`CollabDecoratorNode`) — it syncs the node's existence and serialized props but
not the internal state of a nested sub-editor. A `LexicalNestedComposer`
sub-editor carries its own Yjs binding the parent collab plugin does not manage.

1. **Decorator node + nested sub-editor.** Isolation is structural and free.
   Cost: a separate Yjs binding per body or no live collab inside it; separate
   undo stack; heaviest to build.
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
