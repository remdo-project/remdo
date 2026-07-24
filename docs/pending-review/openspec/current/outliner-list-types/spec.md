# List Types Specification

## Purpose

Define supported outliner list types and the user-visible behavior of changing
list types and note checked state.

## Requirements

### Requirement: Lists support level-local types

RemDo MUST support bullet, number, and check lists. Changing a list's type MUST
affect only that list level; nested lists retain their own types.

#### Scenario: Change a list with nested content

- **WHEN** a user changes a list that contains a nested list to another
  supported type
- **THEN** the selected list level changes type and the nested list does not

### Requirement: Checked state is independent and durable

A note's checked state MUST remain visible in every list type and MUST survive
list-type changes, reload, and collaboration.

#### Scenario: Change and reopen a checked note

- **WHEN** a checked note changes list type and the document is later reopened
  or observed by a collaborator
- **THEN** the note remains visibly checked

### Requirement: Checked-state changes apply recursively

Changing a note's checked state MUST set that note and all its descendants to
the same state. For a [note range](/docs/outliner/selection.md#note-ranges),
RemDo MUST use one target state: uncheck when every note in the range is
checked; otherwise check.

#### Scenario: Toggle from a caret or inline text range

- **WHEN** a user toggles checked state with a caret or inline text range in a
  note
- **THEN** that note and all its descendants change to the opposite state of
  the note

#### Scenario: Toggle a selected note range

- **WHEN** a user toggles checked state for a selected note range
- **THEN** every note in the range and its descendants use the shared target
  state

### Requirement: Checked state has a keyboard command

Users MUST be able to toggle checked state with `Cmd+Enter` on macOS and
`Ctrl+Enter` on Windows and Linux, using the current caret, inline text range,
or selected note range as the target.

#### Scenario: Invoke the platform shortcut

- **WHEN** a user presses the checked-state shortcut in the editor
- **THEN** RemDo toggles checked state for the current selection target
