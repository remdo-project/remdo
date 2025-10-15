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

The Lexical adapter serializes the conceptual note tree into a deterministic node
shape:

- The conceptual root note is mapped to Lexical's `RootNode`. A dedicated schema
  plugin (`src/editor/plugins/RootSchemaPlugin.tsx`) keeps this root constrained
  to a single child `ListNode`, preserving the invariant that all top-level
  notes live inside one canonical list container.
- Every ordered set of child notes is represented by a `ListNode`, which
  expresses "these are the children of a given conceptual parent" while
  preserving their sibling order and list metadata.
- Each individual note becomes a content-bearing `ListItemNode` inside its
  parent's `ListNode`. The position of that list item mirrors the note's ordinal
  position among its siblings. Inside this list item Lexical stores the note's
  payload—typically a `ParagraphNode` that wraps one or more `TextNode`s for the
  textual content, but potentially any inline structure the adapter supports.
- When a note has children, Lexical inserts an additional `ListItemNode`
  immediately after the content item for that same note. This extra list item is
  intentionally empty; its only child is a nested `ListNode` that serializes the
  note's descendants. Each child note then repeats the same pattern (content
  list item, optional wrapper list item, nested list) as needed.
- `TextNode`s nested under the content `ListItemNode` store the literal string
  payload (with formatting metadata) and remain isolated from the structural
  nodes that encode hierarchy.
