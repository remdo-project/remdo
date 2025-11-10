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

- Each note is uniquely addressable inside its tree.
- Every note has exactly one parent (except the root) and maintains an ordered
  list of children owned by that parent.
- Ordering metadata lives with the parent, so sibling order changes do not
  mutate child notes.
- Content and props never alter the structural contract; a note may be purely
  structural or carry opaque content without affecting its position.

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

- **tree_complex.json →**

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

Notes can be restructured via indent/outdent or reordering actions, and these
edits must preserve the outline's structural guarantees. Outdenting (shortcut
`Shift+Tab`) moves the selected note’s subtree up one level and inserts it
directly after its former parent. See
[Note Structure Rules](./note-structure-rules.md) for the full set of editing
rules that govern these operations.

### Selection Overview

RemDo’s editor keeps every selection aligned to whole notes so structural
commands always act on complete subtrees.
[Selection](./selection.md) details the cursor-driven gestures, progressive
selection behavior, shortcut summary, and command compatibility matrix that
implementations must honor.
