# Remdo v2 – Note Concept (early draft)

## Purpose

Define **note** as a high‑level, implementation‑agnostic concept for the core of
the app. Editors and data sources (Lexical, Markdown, filesystem) are
interchangeable **adapters** that translate to/from this concept without
changing its invariants.

---

## Core Idea: Note (Concept)

A **note** is the smallest addressable unit of knowledge in the app. It is:

- **Addressable** (optionally by a stable `NoteId`; otherwise via structural
  path or adapter-native anchor; IDs are only required for persistent linking).
- **Typed** (a discriminant “kind”, e.g., `text`, `link`, `document`, …).
- **Content‑bearing** (optional body/payload, opaque to the core model).
- **Relational** (owns an ordered list of children → forms a tree; optional
  cross‑refs later).
- **Extensible** (arbitrary per‑note metadata/properties).

Think of the system as a **Note Graph constrained to a tree** for primary
structure, with optional secondary relations (backlinks, references) that do not
alter the tree.

### Invariants (independent of any editor)

- Every note has **exactly one parent** (except a root) and **an ordered list of
  children**.
- **Ordering lives with the parent**, not the children.
- **Content is orthogonal to structure** (a note may have body content or be
  purely structural).
- **Kinds are additive**: selected by a discriminant (`kind`) with a flexible
  `props` bag.
- **Optional identity**: if present, `NoteId` must be stable across adapters
  (Lexical, Markdown, filesystem, …). A note may exist **without** an id;
  adapters must provide deterministic fallback addressing and can synthesize an
  id when a stable link is requested.

### Conceptual Shape (not an implementation)

- `NoteId?`: optional stable identifier (used for persistent cross-source links;
  may be absent for ephemeral/inline notes).
- `address`: structural path (e.g., document root → child indices) or
  adapter-native anchor; always derivable even when `NoteId` is absent.
- `kind`: `text` | `link` | `document` | … (open set).
- `content`: opaque payload (interpreted/rendered by adapters).
- `props`: metadata per kind (e.g., `href` for `link`).
- `children`: ordered list of `NoteId`.
- Optional **view metadata** (e.g., `folded`, `checked`, tags) — can be per‑user
  _or_ shared (see decisions below).

## Addressing & Linking

- A note is linkable if it has a stable `NoteId` or a stable adapter-native
  anchor.
- When linking is requested and a note lacks an id, adapters may synthesize one
  (e.g., slug of a Markdown header plus collision disambiguators) and persist it
  (front‑matter/sidecar, Lexical node-key mapping).
- Fallback addressing (no id) uses a **structural path** (document root id +
  child indices). This is deterministic but can break under reordering; good for
  transient references, not long‑lived shares.

---

## Document Relationship

A **document** is a _view anchored at any note_. The anchored note becomes the
document’s root. This keeps “note” pure and lets different sources (e.g., a
Markdown section, a folder in a filesystem, or a Lexical sub‑tree) be treated as
documents simply by pointing at their root `NoteId`.

- A note may carry a semantic `kind: "document"`, but this conveys _intent_
  (entry point) rather than structural special‑casing.

---

## Kinds (examples; extensible)

- **`text`**: generic body content.
- **`link`**: `props.href` (+ optional `title`, preview policy).
- **`document`**: semantic tag signalling “this note can be an entry point”.
- **Future** (non‑exhaustive): `embed` (note→note reference), `query` (virtual
  note with computed children), `todo`, etc.

> Guideline: adding a kind should not change the core invariants or tree
> mechanics.

---

## Adapters (source↔note)

Adapters translate external representations to/from the conceptual model while
enforcing invariants.

### Lexical Adapter (current editor)

**Known representation:** A note’s body is stored in a `ListItem`; its
**children** live in the _nested `List` immediately under that `ListItem`_.

**Contract:**

- Treat the **`ListItem`** as the _note content container_.
- Treat the **immediately nested `List`** (if present) as the _children list_.
- Maintain a bijection between `NoteId` and the corresponding `ListItem` key.
- Normalize edge cases (splits, paste, merges):
  - At most **one** nested `List` per `ListItem`.
  - Create new `NoteId`s on structural splits; preserve IDs on pure content
    edits.

- Keep this two‑node shape **internal to the adapter**; externally, a note
  remains a single conceptual unit.

### Markdown Adapter

- Structure via lists; ordering is list order.
- `- [ ]` / `- [x]` map to a `checked` property (if used).
- Links via `[title](href)` map to `kind: link` with `props.href`.
- Stable IDs via front‑matter (preferred) or hidden anchors
  (`<!-- id: abc -->`).
- Folding is not native → store per‑user folds in a sidecar index or
  front‑matter.

### Filesystem Adapter

- Directory → `document` (or `container`) note; files → `document`/`link` notes.
- `props.path` holds absolute/relative path.
- Children order by a defined policy (name, mtime) or an explicit sidecar index
  to make order deterministic.

---

## Operations (concept‑level)

- **Structure:** insert/move/indent/outdent/delete by `NoteId` (reorder children
  on the parent; never reparent implicitly).
- **Content:** set/replace the opaque body payload (adapter interprets it).
- **State:** toggle/read properties (`folded`, `checked`, tags, custom props).
- **Views:** open a document at `NoteId`, focus a subtree, search/filter.

---

## Open Decisions (with recommendations)

1. **Folded state:** shared vs per‑user.
   - **Recommend:** default **per‑user view state**, with optional “publish
     shared folds” per document when collaboration needs stable outlines.

2. **Checked semantics:** local vs cascading to descendants.
   - **Recommend:** default **local** (no surprise cascades). Provide an
     explicit “cascade to subtree” operation when desired.

3. **Cross‑references:** allow DAG‑style secondary links (backlinks, mentions)
   without changing the primary tree.
   - **Recommend:** **Yes**. Keep the primary tree authoritative; secondary
     relations live in metadata.

4. **Optional identity & persistence across adapters:**
   - **Recommend:** Treat `NoteId` as **optional**. If absent, rely on
     structural path/anchors for local addressing. When a stable link is
     created, **synthesize and persist** an id (front‑matter/sidecar in
     Markdown; key mapping in Lexical). If present, preserve across round‑trips;
     only mint new ids on structural splits.

---

## Non‑Goals (for clarity)

- Define concrete storage schema or class shapes (left to implementation docs).
- Prescribe UI/keyboard interactions (adapter/UI‑level concerns).

---

## Summary

- **Note** is a stable, typed, extensible unit forming a tree via ordered
  children.
- **Documents** are views anchored at notes.
- **Adapters** (Lexical, Markdown, filesystem) translate representations while
  preserving invariants and identity.
- **Extensibility** flows through `kind` and `props` without changing core
  rules.
