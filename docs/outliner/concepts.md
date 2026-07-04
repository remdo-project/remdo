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

- Addressability is per-kind: addressable kinds (editor note, document) carry a
  unique id within their tree (see `./note-ids.md`); other kinds (a body) are
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
- **Note path:** the ordered chain of notes from a top-level note down to and
  including the note itself — its ancestors followed by the note. The document
  root note is not part of any note path.

### Note kinds

Every note has a `kind`. Kinds share the base note concept (structure, content,
props) but differ in the capabilities they expose — for example whether they are
addressable by id, can have children, or can be selected structurally.
"Everything is a note" holds literally: a difference between kinds is a
capability a kind does or does not have, not a separate concept. The set of kinds
and each kind's capabilities are defined where the kinds live, not enumerated
here.

A note's [body](./body.md) is one such kind: it is a note owned by its editor
note, but a restricted one — it has no id, has no children, and is never a
structural-selection head on its own (it can be selected only inline, or
structurally as part of its owning note).

---

## Adapters (source↔note)

Adapters translate external representations to/from the conceptual model while
enforcing invariants.

### Lexical Adapter

- The Lexical-based editor is the only adapter.

### Examples

Each example points to a fixture in `tests/fixtures/<file>.json`. The fixture
name appears in bold with a trailing arrow, followed by a fenced outline of the
resulting note tree.

- **basic.json →**

  ```text
  - note0
    - note00
  - note1
  ```

- **flat.json →**

  ```text
  - note0
  - note1
  - note2
  ```

- **tree.json →**

  ```text
  - note0
  - note1
    - note2
  ```

- **tree-complex.json →**

  ```text
  - note0
    - note00
      - note000
    - note01
  - note1
  - note2
    - note20
  ```

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
  jumps).
- In the Lexical adapter, nesting is represented by a wrapper list item plus a
  nested list. The `indent` field is treated as metadata and must agree with the
  structural wrapper shape; wrapper adjacency is authoritative when resolving
  parent/child relationships.

### Operations

Notes can be restructured via indent/outdent or reordering actions; see
[Note Structure Rules](./note-structure-rules.md) for the editing invariants.

### Selection Overview

Selection behavior is defined in [Selection](./selection.md), which describes
whole-note snapping, the selection ladder, and shortcut coverage.
