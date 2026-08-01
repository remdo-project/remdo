# Reordering

Reordering moves [target note ranges](./selection.md#note-ranges) directionally
while preserving their [document order](./note-model.md#definitions) and
respecting [zoom boundaries](./zoom.md#definitions); inapplicable moves are
no-ops.

## Input bindings

- **Move up:** `Ctrl+Shift+ArrowUp` on macOS;
  `Alt+Shift+ArrowUp` on Windows and Linux.
- **Move down:** `Ctrl+Shift+ArrowDown` on macOS;
  `Alt+Shift+ArrowDown` on Windows and Linux.

## Target resolution

A [caret or inline text selection](./selection.md#selection-states) targets the
[editor note](./note-model.md#note-kinds) that owns its region as a one-note
target range. [Body](./body.md#selection-and-structural-targeting) owns the
mapping from a body region to its editor note. A
[structural selection](./selection.md#selection-states) targets its
[selected note range](./selection.md#note-ranges).

## Directional movement

**Move up** and **Move down** each perform exactly the first valid step in this
cascade:

1. Swap the target note range with its adjacent sibling in the requested
   direction.
2. If there is no adjacent sibling, move the range through the parent's
   adjacent sibling: moving down places it as the next parent's first child;
   moving up places it as the previous parent's last child.
3. If that reparenting is unavailable, outdent one level: moving down places
   the range immediately after its former parent; moving up places it
   immediately before its former parent.
4. If no step is valid, leave the document unchanged.

### Reparenting down

Before:

```text
note1
  note2  <- target
    note3
note4
  note5
```

After:

```text
note1
note4
  note2
    note3
  note5
```

### Outdenting down

Before:

```text
note1
  note2
  note3  <- target
```

After:

```text
note1
  note2
note3
```

## Zoom boundary

When [zoom](./zoom.md) is active, a reordering step is valid only
when the complete result remains inside the zoom boundary. An out-of-boundary
step is skipped while the command continues through the directional cascade.
When no in-boundary step is available, the document remains unchanged.

## Future

- Pointer drag-and-drop reordering: placement-driven indent and reparent
  following the same structural rules as the directional cascade.
