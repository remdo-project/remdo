# Note model

RemDo models notes independently of editors and data sources, with shared
structure, owned data, kinds, and structural terms. Editors and data sources
are adapters that preserve this model.

## Notes

A **note** exposes content to adapters and participates in ordered containment
structure.

- **Structure** is the note's parent and its position among that parent's children.
- **Content** is the payload a note exposes to adapters; the model treats it as
  opaque data.
- **Props** are additional attributes that do not affect structure.

## Invariants

Adapters preserve these guarantees whenever they create, import, or export notes:

- Addressability is kind-specific. An editor note carries a unique
  [`noteId`](./note-ids.md) within its tree. An editor document carries its separate
  [`docId`](../../architecture.md#document-identity); a [body](./body.md) is identified
  through its owning editor note rather than by its own identifier.
- A contained note has exactly one canonical parent, independent of the route
  used to reach it. Its parent lists it among its children. An editor note's body
  is separate from its content and is not one of its children.
- A parent read identifies the current parent, or returns null for a known
  structural root. Reparenting a note does not retarget a previously returned
  parent reference.
- An editor document always contains at least one editor note. An operation
  that would remove the final editor note leaves an empty editor note instead.
- A parent owns its contained children's order, so changing sibling order does
  not mutate the child notes.
- Content does not alter a note's structural position.

## Definitions

- **Access root:** a note that owns the [authorization policy](../access/access-control.md#access-roots) for
  itself and the notes under it, independently of editor or storage
  representation. Editor documents, workspaces and account roots are access
  roots.
- **Document:** an outline edited as a unit: an editor document, or a
  [Document](#note-kinds) note, a `.md` file in a workspace.
- **Editor document:** a document containing an editor outline.
- **Account root:** an access root without an outline, owned by one account and
  backed by its account record. The [User Data root](./user-data.md#hierarchy) is the signed-in
  account's account root.
- **Document order:** the depth-first, pre-order traversal of editor notes in
  the structural tree.
- **Previous note / next note:** adjacent editor notes in document order. View
  filters such as [zoom](./zoom.md) and [folding](./folding.md) can hide notes without changing that order.
- **Content text:** a note's own text. An editor note's content text contains no
  hard line breaks.
- **Empty note:** an editor note whose content text is empty after trimming
  whitespace. Its body is separate and does not affect this state.
- **Empty leaf note:** an empty note with no children.
- **Document root note:** the document itself. Its content text is the document
  name. An editor document root is not directly selectable and has Content and
  Access collection notes as children, in that order. Content owns
  the top-level editor notes; Access owns the document's [direct grants](./user-data.md).
  An editor document's account-level parent follows the
  [user-data hierarchy](./user-data.md#hierarchy).
- **Subtree:** an editor note and all its descendants. Structural moves preserve
  subtrees as indivisible units.
- **Note path:** the ordered chain of editor notes from a top-level note through
  a note's ancestors to the note itself. The document root and collection notes
  are not part of a note path.

## Collections

A collection is a note kind that lists ordered notes through the shared
`getChildren()` read and resolves a listed note by identity through `getById()`,
returning null when it is known absent. A collection can compute its children
without changing their parents. The collection determines listing order.
Unavailable contents produce the
[unavailable-note error](./open-document.md#state-and-observation) rather than an empty list.

Listing a note does not imply ownership or support for insertion, reordering, or
deletion. Structural operations follow containment; recursive navigation handles
repeated notes and cycles. The visited route belongs to caller state and need
not follow canonical ancestry.

## Note kinds

Every note has a kind. Kinds share structure, content, and props but differ in
the capabilities they expose, including whether they are addressable, can own
children, or can be [selected structurally](./selection.md). Each kind's owner
defines its additional capabilities.

An account's root, its [workspaces](../workspaces/store.md) and their files form
a tree of notes of the kinds below, which share the
[note operations](./note-operations.md). A kind's text is what
[Set text](./note-operations.md#operations) changes.

- **Account root:** the signed-in account's [account root](#definitions). Its
  children include the account's workspaces, ordered by name, and it always
  holds a personal one. Its text is the account's email address.
- **Workspace:** the [access root](#definitions) of every note in it. Its
  children are the folders, documents and plain files at its top level, ordered
  by name. Its text is its name.
- **Folder:** the shared path of the files under it; it exists while it holds a
  file. Its children are as for a workspace, under its path. Its text is its
  last path segment.
- **Document:** a `.md` file read as an outline in the
  [RemDo text format](../../format.md). Its children are its Markdown blocks and
  outline notes. Its text is its file name without `.md`.
- **Outline note:** a heading or list item of a document. Its children are its
  Markdown blocks and outline notes. Its text is its own line as written:
  marker, checkbox, name and text.
- **Markdown block:** other Markdown in a document. It has no children. Its
  text is its source.
- **Plain file:** any other file, with opaque content. It has no children. Its
  text is its file name.

Changing a note's text never changes its kind, and the name of a folder,
document or plain file must be a valid [path segment](../workspaces/store.md#paths).

A reference to one of these notes names its workspace and its path there, which
is empty for the workspace itself; a reference without a workspace names the
account root. **Deterministic.**
