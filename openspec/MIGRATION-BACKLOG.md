# Legacy Specification Migration Backlog

Tracks accepted decisions that migration work must preserve until their
permanent owner under [`spec/`](../spec/README.md) exists. This file is temporary
and non-normative: each
entry links its current authoritative source, names its intended destination,
and defines when the entry can be removed. Only the accepted decision moves to
the permanent owner. **Avoid** guidance exists to prevent drift while the
documentation is inconsistent and MUST be dropped, not migrated, with its
entry.

## Terminology

### Structural selection and note ranges

- **Decision:** A **structural selection** selects one or more notes as
  structural units rather than selecting their text. A **note range** is one or
  more contiguous sibling notes, each together with its entire subtree; it is a
  shared structural-command operand, not a selection kind. Use **selected note
  range** for a structural selection's range and **target note range** when a
  command may resolve the range from either a structural or non-structural
  selection.
- **Avoid:** Do not use **selection head** as a product term or use **note
  range** as the name of a selection kind. Do not introduce **block selection**
  as an alias: RemDo's product-level structural unit is a note.
- **Current authority:** [Selection](/docs/outliner/selection.md#selection-states).
- **Intended owner:** The selection capability; structural commands consume the
  term but do not redefine it.
- **Remove when:** The definition has moved to the main selection spec and all
  inbound links target that permanent owner.
