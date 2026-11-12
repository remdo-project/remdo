# List types

[Editor notes](./note-model.md#note-kinds) support the outliner's markers,
checkboxes, list types, list-type conversion, and checked state, including
target resolution for checked-state changes.
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

A note keeps its marker and checkbox wherever it moves. A note the editor
creates from another, as by `Enter` or a split, takes that note's marker
without its start, and an open checkbox when that note has one.

## Supported types

A list's items are its outline notes other than headings. Its type is check
when every item has a checkbox, otherwise number when every item is numbered,
otherwise bullet, including when it has no items.

## Type conversion

Converting a list acts on that list's items only; nested lists keep theirs.

- **To bullet or number:** each item takes that marker, keeping its checkbox.
- **To check:** each item without a checkbox takes an open one, keeping its
  marker.
- **Removing checkboxes:** each open checkbox is removed; checked notes keep
  theirs.

## Checked state

A note is checked when its checkbox is checked. Checking a note without a
checkbox gives it a checked one, and unchecking leaves an open one. Checked
state survives list-type changes, reload, and collaboration. Bodies have no
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
