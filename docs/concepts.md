# Remdo – Note Concept (early draft)

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

- Each note is uniquely addressable inside its tree.
- Every note has exactly one parent (except the root) and maintains an ordered
  list of children owned by that parent.
- Ordering metadata lives with the parent, so sibling order changes do not
  mutate child nodes.
- Content and props never alter the structural contract; a note may be purely
  structural or carry opaque content without affecting its position.

---

## Adapters (source↔note)

Adapters translate external representations to/from the conceptual model while
enforcing invariants.

### Lexical Adapter (current editor)

- Lexical-based editor is currently the only available adapter.

### Examples

Examples below are in the following format:

file.json # fixture file from tests/fixtures Note structure represtantation that
mapps to data from file.json

#### Basic

basic.json

- note0
  - note00
- note1

#### Flat

flat.json

- note0
- note1
- note2

#### Tree

tree.json

- note0
- note1
  - note2

#### Tree complex

tree_complex.json

- note0
  - note00
    - note000
  - note01
- note1
- note2
  - note20

### Lexical Representation

The Lexical adapter serializes the conceptual note tree into a deterministic
node shape:

- The conceptual root note is mapped to Lexical's `RootNode`. A dedicated schema
  plugin (`src/editor/plugins/RootSchemaPlugin.ts`) keeps this root constrained
  to a single child `ListNode`; the `ListItemNode` children of that list are the
  root note's direct descendants.
- Every non-root note is serialized as a `ListItemNode` whose children hold the
  note's payload (for example a `ParagraphNode` with `TextNode`s).
- When a note has children, the adapter inserts a second `ListItemNode`
  immediately after the content item. This wrapper item contains a nested
  `ListNode`, and the `ListItemNode`s inside that nested list represent the
  note's conceptual descendants.

### Operations

Notes can be moved—reordered among siblings, indented to become the previous
sibling's child, outdented to become the parent's sibling, or relocated under a
different parent. Moving a note always moves its descendants, and the
corresponding Lexical nodes must be updated to reflect the new hierarchy.
