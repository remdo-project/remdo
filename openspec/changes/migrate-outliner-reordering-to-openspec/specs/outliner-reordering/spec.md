## ADDED Requirements

### Requirement: Keyboard reordering resolves a target note range

Users MUST be able to move the current
[target note range](/docs/outliner/selection.md#note-ranges) upward or downward
with `Ctrl+Shift+ArrowUp` / `Ctrl+Shift+ArrowDown` on macOS and
`Alt+Shift+ArrowUp` / `Alt+Shift+ArrowDown` on Windows and Linux. A caret or
inline text range in note content MUST resolve to its note as a one-note target
range. A [structural selection](/docs/outliner/selection.md#selection-states)
MUST resolve to its selected note range. Reordering MUST preserve the notes'
document order and carry each note's entire subtree.

#### Scenario: Reorder from a non-structural selection

- **WHEN** a user invokes a reordering shortcut from a caret or inline text
  range in note content
- **THEN** the corresponding directional move targets that note and its subtree

#### Scenario: Reorder from a structural selection

- **WHEN** a user invokes a reordering shortcut from a structural selection
- **THEN** the corresponding directional move targets its complete selected
  note range and subtrees

### Requirement: Reordering uses the first valid directional step

Each reordering command MUST perform exactly one first-valid step from this
ordered cascade:

1. Swap the target note range with its adjacent sibling in the requested
   direction.
2. If there is no adjacent sibling, move the range through the parent's
   adjacent sibling: move down places it as the next parent's first child; move
   up places it as the previous parent's last child.
3. If that reparent is unavailable, outdent one level: move down places the
   range immediately after its former parent; move up places it immediately
   before its former parent.
4. If no step is valid, leave the document unchanged.

#### Scenario: Adjacent sibling is available

- **WHEN** a target note range has an adjacent sibling in the requested direction
- **THEN** the range swaps with that sibling without reparenting or outdenting

#### Scenario: Parent has an adjacent sibling

- **WHEN** the range has no directional sibling and its parent has one
- **THEN** the range moves into that parent sibling at the direction-specific
  edge

##### Example: Move down into the next parent

Before:

```text
note1
  note2  <- target
    note3
note4
  note5
```

Action:

Move the target down.

After:

```text
note1
note4
  note2
    note3
  note5
```

#### Scenario: Only outdent is available

- **WHEN** neither sibling movement nor reparenting is available and the range
  can outdent
- **THEN** the range moves beside its former parent in the requested direction

##### Example: Move down after the former parent

Before:

```text
note1
  note2
  note3  <- target
```

Action:

Move the target down.

After:

```text
note1
  note2
note3
```

#### Scenario: No directional step is available

- **WHEN** every step in the directional cascade is invalid
- **THEN** the document remains unchanged

### Requirement: Reordering stays within the zoom boundary

When [zoom](/docs/outliner/zoom.md) is active, a reordering step MUST be valid
only when its result remains inside the zoom boundary. The command MUST skip
out-of-boundary steps while continuing through the directional cascade and
MUST leave the document unchanged when no in-boundary step is available.

#### Scenario: A fallback would cross the zoom boundary

- **WHEN** a candidate reordering step would place any moved note outside the
  active zoom boundary
- **THEN** that step is skipped and the next in-boundary fallback is attempted

#### Scenario: No movement remains inside zoom

- **WHEN** every candidate step would leave the active zoom boundary
- **THEN** the document remains unchanged
