# OpenSpec Migration Backlog

Tracks accepted decisions that migration work must preserve until their
permanent OpenSpec owner exists. This file is temporary and non-normative: each
entry links its current authoritative source, names its intended destination,
and defines when the entry can be removed. Only the accepted decision moves to
the permanent owner. **Avoid** guidance exists to prevent drift while the
documentation is inconsistent and MUST be dropped, not migrated, with its
entry.

## Terminology

### Note range

- **Decision:** Use **note range** for one or more contiguous sibling notes,
  each selected together with its entire subtree.
- **Avoid:** Do not use **selection head** or **structural selection** as product
  terms. The first describes editor-internal machinery; use **note range** for
  the selection state and reserve **structural** for modes and commands.
- **Current authority:** [Selection](/docs/outliner/selection.md#selection-states).
- **Intended owner:** The selection capability; structural commands consume the
  term but do not redefine it.
- **Remove when:** The definition has moved to the main selection spec and all
  inbound links target that permanent owner.
