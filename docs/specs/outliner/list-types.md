# List types

This specification defines the outliner's supported list types, list-type
conversion, and the checked state of
[notes](../../outliner/concepts.md#core-idea-note-concept), including how
checked-state changes resolve their targets. Selection kinds and note ranges are
defined by [Selection](../../outliner/selection.md).

## Supported types

A list's type is a property of the list, not of an individual note. The
supported types are bullet, number, and check.

## Type conversion

Changing a list's type converts only that list; nested lists keep their own
types unless changed separately.

## Checked state

A note's checked state is independent of its list type: the state remains
visible in every list type and survives list-type changes, reload, and
collaboration.

Setting a note's checked state is recursive: the note and all of its
descendants take the same state.

A note displays as checked only while it and all of its descendants are
checked; when only some are, it displays as mixed.

### Toggling

Toggling sets a target's notes and all their descendants to one state:
unchecked when every one of them is already checked, otherwise checked.

A caret or inline text range targets the note holding it; the marker of a note
in a check list targets the clicked note while that note is outside any
structural selection. A structural selection — including a marker click on a
note inside it — targets its selected
[note range](../../outliner/selection.md#note-ranges). Other surfaces — the
[note menu](../../outliner/menu.md) and the
[mobile action toolbar](../../outliner/mobile-toolbar.md) — supply their own
targets, as their contracts define.

### Keyboard command

`Cmd+Enter` on macOS and `Ctrl+Enter` on Windows and Linux toggle checked state
for the current target.
