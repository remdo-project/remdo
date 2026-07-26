# Reordering

This specification defines keyboard-driven reordering of target note ranges,
including directional movement, subtree integrity, zoom boundaries, and no-op
behavior. Selection kinds and note ranges are defined by
[Selection](../../outliner/selection.md).

## Keyboard reordering

`Ctrl+Shift+ArrowUp` and `Ctrl+Shift+ArrowDown` on macOS, and
`Alt+Shift+ArrowUp` and `Alt+Shift+ArrowDown` on Windows and Linux, move the
current target note range upward or downward.

A caret or inline text selection targets the
[editor note](../../outliner/concepts.md#note-kinds) that owns its region as a
one-note target range. A structural selection targets its selected note range.

Reordering preserves the notes' document order and moves each note with its
entire subtree.

## Directional movement

Each reordering command performs exactly the first valid step in this cascade:

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

When [zoom](../../outliner/zoom.md) is active, a reordering step is valid only
when the complete result remains inside the zoom boundary. An out-of-boundary
step is skipped while the command continues through the directional cascade.
When no in-boundary step is available, the document remains unchanged.

## Future

- Pointer drag-and-drop reordering: placement-driven indent and reparent
  following the same structural rules as the keyboard cascade.
