# List Types

## Purpose

Define list type behavior (bullet, number, check) and checked-state semantics.

## Rules

1. List type is a property of the list container, not an individual note.
2. Supported list types are `bullet`, `number`, and `check`.
3. Switching list type is level-local: only that list is converted; descendant
   lists keep their own types unless switched separately.
4. Checked state is a note prop independent of list type.
5. Checked state persists across list type switches, reload, and collaboration.
6. Checked state remains visible in every list type.
7. Switching list type never clears checked state.
8. Multi-note toggle uses one target state for all selected notes:
   if all selected notes are checked, set all to unchecked; otherwise set all
   to checked.

## Commands

1. Toggle checked: `Cmd+Enter` (macOS), `Ctrl+Enter` (Windows/Linux).
2. With a note selection, toggle checked applies the computed target state to
   every selected note.
