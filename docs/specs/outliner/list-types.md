# List types

[Editor notes](./note-model.md#note-kinds) support the outliner's markers,
checkboxes, their placement and conversion, and checked state, including target
resolution for checked-state changes.
[Selection states](./selection.md#selection-states) and [note ranges](./selection.md#note-ranges) are defined by Selection.

## Markers and checkboxes

Each note has its own marker and checkbox, as the
[text format](../../format.md) holds them.

- **Bullet:** shows a bullet.
- **Number:** shows its start when it has one, otherwise one more than the
  sibling before it when that sibling is numbered, otherwise 1.
- **Heading:** shows a bullet, with its text styled by its level.
- **Checkbox:** none, open, or checked, shown after the marker whatever the
  marker is.

## Placement

A note lands where it is created, by `Enter`, a split, an append or a paste,
and where it moves under a new parent; reordering among the same siblings
changes nothing. In this section, siblings are outline notes other than
headings. A landing note other than a heading takes:

- **Marker:** that of the sibling before it, otherwise after it, otherwise its
  parent's, without a start; under a heading or at the top level it is a
  bullet.
- **Checkbox:** an open one when every other sibling has a checkbox, or, as a
  first child, when every sibling of its parent has one; otherwise none. A
  checked note keeps its checkbox.

A heading or body keeps its own kind wherever it lands, within what the
[text format](../../format.md) can hold.

## Type conversion

Converting acts on a note's children other than headings; deeper notes keep
theirs.

- **To bullet or number:** each takes that marker, keeping its checkbox.
- **To check:** each without a checkbox takes an open one, keeping its marker.
- **Removing checkboxes:** each open checkbox is removed; checked notes keep
  theirs.

The children are a check list when every one has a checkbox.

## Checked state

A note is checked when its checkbox is checked. Checking a note without a
checkbox gives it a checked one, and unchecking leaves an open one. Checked
state survives conversion, reload, and collaboration. Bodies have no
checked state.

Setting a note's checked state is recursive: the note and all of its
descendants take the same state.

A checked note reads as complete, whatever the state of its descendants. A
checked note whose descendants are not all checked additionally marks that its
subtree holds unfinished work, and every unchecked note under a checked one is
presented as unfinished work rather than as part of the completed note.

On a middle [split](./insertion.md#default-behavior-caret-selection), the
original leading note retains its checked state, the fresh trailing note starts
unchecked, and existing descendants retain their states.

### Toggling

Toggling sets a target's notes and all their descendants to one state:
unchecked when every one of them is already checked, otherwise checked.

[A caret or inline text selection](./selection.md#selection-states) in an [outline selection region](./selection.md#selection-states) targets the editor
note owning the region; [Body](./body.md#selection-and-structural-targeting) owns the mapping from a
body selection region to its editor note. A note's checkbox targets the
clicked note while that note is outside any
[structural selection](./selection.md#selection-states). A structural selection
— including a checkbox click on a note inside it — targets its
[selected note range](./selection.md#note-ranges). Other surfaces — the [note
menu](./menu.md), [desktop editing toolbar](./desktop-toolbar.md), and [mobile action toolbar](./mobile-toolbar.md) — supply
their own targets, as their contracts define.

### Keyboard command

`Cmd+Enter` on macOS and `Ctrl+Enter` on Windows and Linux toggle checked state
for the current target.
