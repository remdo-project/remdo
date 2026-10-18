# Note model

RemDo models notes independently of editors and data sources, with shared
structure, owned data, kinds, and structural terms. Editors and data sources
are adapters that preserve this model.

## Notes

A **note** lives inside an ordered tree and exposes content to adapters. The
document, collections, editor notes, and note bodies have kind-specific
capabilities.

- **Structure** is the note's parent and its position among that parent's children.
- **Content** is the payload a note exposes to adapters; the model treats it as
  opaque data.
- **Props** are additional attributes that do not affect structure.

## Invariants

Adapters preserve these guarantees whenever they create, import, or export notes:

- Addressability is kind-specific. An editor note carries a unique
  [`noteId`](./note-ids.md) within its tree. A document carries its separate
  [`documentId`](./note-ids.md#definitions); a [body](./body.md) is identified
  through its owning editor note rather than by its own identifier.
- Within a document, every note except the document root has exactly one parent.
  Each parent owns an ordered list of children, and parent and children reads
  agree. An editor note's body is separate from its content and is not one of
  its children.
- A document always contains at least one editor note. An operation that would
  remove the final editor note leaves an empty editor note instead.
- A parent owns its children's order, so changing sibling order does not mutate
  the child notes.
- Content does not alter a note's structural position.

## Definitions

- **Document order:** the depth-first, pre-order traversal of editor notes in
  the structural tree.
- **Previous note / next note:** adjacent editor notes in document order. View
  filters such as [zoom](./zoom.md) and [folding](./folding.md) can hide notes without changing that order.
- **Content text:** a note's own text. An editor note's content text contains no
  hard line breaks.
- **Empty note:** an editor note whose content text is empty after trimming
  whitespace. Its body is separate and does not affect this state.
- **Empty leaf note:** an empty note with no children.
- **Document root note:** the document itself, identified by its document ID.
  Its content text is the document name. It is not directly selectable. Its
  children are Content and Access collection notes, in that order. Content owns
  the top-level editor notes; Access owns the document's [direct grants](./user-data.md).
  Both use the same collection kind.
- **Subtree:** an editor note and all its descendants. Structural moves preserve
  subtrees as indivisible units.
- **Note path:** the ordered chain of editor notes from a top-level note through
  a note's ancestors to the note itself. The document root and collection notes
  are not part of a note path.

## Note kinds

Every note has a kind. Kinds share structure, content, and props but differ in
the capabilities they expose, including whether they are addressable, can own
children, or can be [selected structurally](./selection.md). Each kind's owner
defines its additional capabilities.
