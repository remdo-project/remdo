# RemDo – Note Concept

## Purpose

Define **note** as a high‑level, implementation‑agnostic concept for the core of
the app. Editors and data sources (Lexical, Markdown, filesystem) are
interchangeable **adapters** that translate to/from this concept without
changing its invariants.

---

## Core Idea: Note (Concept)

A **note** is the smallest unit of knowledge in the app. A note lives inside an
ordered tree and exposes content to adapters. Everything in the model is a note:
the document, an editor note (the outline item you type into), and a note's body
are all **kinds** of note, distinguished by a `kind` discriminator. Capabilities
differ by kind — for example, only some kinds are addressable by id (see
[Note kinds](#note-kinds)).

Notes carry three kinds of information: structure, content, and props.

- **Structure** is the position of a note in the tree: its parent and the order
  of its children.
- **Content** is the payload a note exposes to adapters; the core model treats
  it as opaque data.
- **Props** are additional key/value attributes that enrich the note without
  affecting its structure.

### Invariants (independent of any editor)

Adapters must preserve these guarantees whenever they create, import, or export
notes:

- Addressability is per-kind: an editor note is addressable, carrying a unique
  `noteId` within its tree (see [Note IDs](./note-ids.md)); a document carries
  its own distinct identity (`documentId`, environment-injected — see
  [Note IDs](./note-ids.md#scope)), not a `noteId`; other kinds (a body) are
  identified by their position relative to their owning note, not by an id.
- Every note has exactly one parent (except the root) and maintains an ordered
  list of children owned by that parent. **Children** are the notes parented in
  the structural tree (for an editor note, its sub-notes). A note's body is not a
  child: it is a separate region owned by the note, reached on its own, never
  part of the children list (see [Note kinds](#note-kinds)).
- The note tree is never empty: the document always contains at least one note.
  If an operation would remove the final note, adapters must replace it with an
  empty note instead of producing an empty document.
- Ordering metadata lives with the parent, so sibling order changes do not
  mutate child notes.
- Content and props never alter the structural contract; a note may be purely
  structural or carry opaque content without affecting its position.

### Definitions

- **Document order:** the depth-first, pre-order traversal of notes in the
  structural tree.
- **Previous note / next note:** adjacent notes in document order. View filters
  like zoom and folding can hide notes without changing their underlying order
  (see `./zoom.md` and `./folding.md`).
- **Empty note:** a note whose own content text is empty after trimming
  whitespace. ("Content text" is the note's own text, distinct from its
  [body](./body.md), which is a separate region.)
- **Empty leaf note:** an empty note with no children.
- **Document root note:** the special root note that represents the document
  itself. It has no parent and is not directly selectable; all top-level notes
  are its children.
- **Subtree:** a note and all of its descendants; structural moves are always
  subtree-atomic (see `./note-structure-rules.md`).
- **Sibling slab:** a contiguous run of sibling notes under the same parent.
- **Note path:** the ordered chain of notes from a top-level note down to and
  including the note itself — its ancestors followed by the note. The document
  root note is not part of any note path.

### Note kinds

Every note has a `kind`. Kinds share the base note concept (structure, content,
props) but differ in the capabilities they expose — for example whether they are
addressable by id, can have children, or can be
[selected structurally](./selection.md). The set of
kinds and each kind's capabilities are defined where the kinds live, not
enumerated here.

---

## Adapters (source↔note)

Adapters translate external representations to/from the conceptual model while
enforcing invariants.

### Lexical Representation

The Lexical adapter serializes the conceptual note tree into a deterministic
Lexical node shape:

- The conceptual root note is mapped to Lexical's `RootNode`. A dedicated schema
  plugin keeps this root constrained to a single child `ListNode`; the
  `ListItemNode` children of that list are the root note's direct descendants.
- Every non-root note is serialized as a `ListItemNode` whose children hold the
  note's payload (for example a `ParagraphNode` with `TextNode`s).
- When a note has children, the adapter inserts a second `ListItemNode`
  immediately after the content `ListItemNode`. This wrapper `ListItemNode`
  contains a nested `ListNode`, and the `ListItemNode`s inside that nested list
  represent the note's conceptual descendants.

### Runtime contract vs persistence boundaries

- Runtime editor logic assumes the canonical Lexical shape above is already
  enforced (root has exactly one top-level list, content notes have runtime
  `noteId`, wrapper adjacency is valid). Invariant violations are treated as
  bugs, not as normal nullable control flow.
- Tolerant repair/rehydration behavior belongs only to persisted↔runtime
  boundaries (load/import/save/export pipelines), not to normal runtime editing
  helpers.

### Indentation (concept vs. adapter)

- Conceptually, RemDo models a tree: every note has exactly one parent, so a
  child is always exactly one level deeper than its parent (no multi-level
  jumps); the editing invariants for restructuring (indent/outdent,
  reordering) live in [Note Structure Rules](./note-structure-rules.md).
- In the Lexical adapter, nesting is represented by a wrapper list item plus a
  nested list. The `indent` field is treated as metadata and must agree with the
  structural wrapper shape; wrapper adjacency is authoritative when resolving
  parent/child relationships.
