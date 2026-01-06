# RemDo – Note Concept (early draft)

## Purpose

Define **note** as a high‑level, implementation‑agnostic concept for the core of
the app. Editors and data sources (Lexical, Markdown, filesystem) are
interchangeable **adapters** that translate to/from this concept without
changing its invariants.

---

## Core Idea: Note (Concept)

A **note** is the smallest addressable unit of knowledge in the app. A note is
individually addressable, lives inside an ordered tree, and can be referenced by
other notes or external tooling.

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

- Each note is uniquely addressable inside its tree (see `./note-ids.md`).
- Every note has exactly one parent (except the root) and maintains an ordered
  list of children owned by that parent.
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
- **Previous note / next note:** adjacent notes in document order;
  folding/collapse is currently out of scope.
- **Empty note:** a note whose body text is empty after trimming whitespace.
- **Empty leaf note:** an empty note with no children.

---

## Adapters (source↔note)

Adapters translate external representations to/from the conceptual model while
enforcing invariants.

### Lexical Adapter (current editor)

- Lexical-based editor is currently the only available adapter.

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
  plugin (`src/editor/plugins/RootSchemaPlugin.tsx`) keeps this root constrained
  to a single child `ListNode`; the `ListItemNode` children of that list are the
  root note's direct descendants.
- Every non-root note is serialized as a `ListItemNode` whose children hold the
  note's payload (for example a `ParagraphNode` with `TextNode`s).
- When a note has children, the adapter inserts a second `ListItemNode`
  immediately after the content `ListItemNode`. This wrapper `ListItemNode`
  contains a nested `ListNode`, and the `ListItemNode`s inside that nested list
  represent the note's conceptual descendants.

### Operations

Notes can be restructured via indent/outdent or reordering actions; see
[Note Structure Rules](./note-structure-rules.md) for the editing invariants.

### Selection Overview

Selection behavior is defined in [Selection](./selection.md), which describes
whole-note snapping, progressive expansion, and shortcut coverage.
