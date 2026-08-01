# Lexical note adapter

This specification defines how the Lexical editor adapter represents the
[note model](./note-model.md) and where canonical runtime assumptions give way
to tolerant persistence handling.

## Representation

The adapter maps the document root to Lexical's `RootNode`. The root contains
one `ListNode`, whose `ListItemNode` children represent the document root's
editor-note children.

Each editor note is a content `ListItemNode` whose children hold the note's
payload. When that note has children, an adjacent wrapper `ListItemNode`
follows it. The wrapper contains the nested `ListNode` whose items represent
the note's children.

Wrapper adjacency is authoritative when resolving parent and child
relationships. Lexical's `indent` field is metadata and agrees with that
structural representation.

## Runtime and persistence boundaries

Runtime editor logic receives the canonical representation, including
addressable content items with [`noteId`](./note-ids.md). A violation is an
implementation defect rather than an expected nullable case for editing
helpers.

Persisted-state load, import, save, and export boundaries own tolerant
normalization. They repair external representations before exposing them to
runtime editing and serialize the canonical runtime model for persistence.

Structural behavior remains owned by the capability performing it, including
[indentation](./indentation.md) and [reordering](./reordering.md).
