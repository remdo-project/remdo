# Lexical outline adapter

The Lexical editor adapter represents the
[note model](../outliner/note-model.md) canonically at runtime and tolerates
external representations only at persistence boundaries.

## Representation

The adapter maps the [document root](../outliner/note-model.md#definitions) to
Lexical's `RootNode`. The root contains one `ListNode`, whose `ListItemNode`
children represent the document root's [editor-note](../outliner/note-model.md#note-kinds) children.

Each editor note is a content `ListItemNode` whose children hold the note's
payload. When that note has children, an adjacent wrapper `ListItemNode`
follows it. The wrapper contains the nested `ListNode` whose items represent
the note's children.

When an editor note has a [body](../outliner/body.md), a body-wrapper
`ListItemNode` follows the content item and precedes any children wrapper. It
holds the body payload and is not itself an editor note.

Wrapper adjacency is authoritative when resolving parent and child
relationships. Lexical's `indent` field is metadata and agrees with that
structural representation.

## Runtime and persistence boundaries

Runtime editor logic receives the canonical representation, including
addressable content items with [`noteId`](../outliner/note-ids.md). A violation
is an implementation defect rather than an expected nullable case for editing helpers.

Persisted-state load, import, save, and export boundaries own tolerant
normalization. They repair external representations before exposing them to
runtime editing and serialize the canonical runtime model for persistence.

Structural behavior remains owned by the capability performing it, including
[indentation](../outliner/indentation.md) and [reordering](../outliner/reordering.md).
