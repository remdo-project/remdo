# List Types

## Purpose

Define list type behavior (bullet, number, check) and checked-state semantics.

## Rules

1. List type is a property of the list container, not an individual note.
2. Supported list types are `bullet`, `number`, and `check`.
3. Switching list type is level-local: only that list is converted; descendant
   lists keep their own types unless switched separately.
4. Checked state is a note prop independent of list type.
5. Checked state uses presence semantics: `true` means checked, and an unset
   value means unchecked.
6. Checked notes remain checked across list type switches, reload, and
   collaboration.
7. Checked state remains visible in every list type.
8. Switching list type never changes a note's effective checked status.
9. Setting checked state on a note is recursive: that note and all of its
   descendants are set to the same checked value.
10. Multi-note toggle uses one target state for all selected roots:
   if all selected roots are checked, set all to unchecked; otherwise set all
   to checked.
11. A selected root is any selected note whose parent is not also selected.
    Descendants under another selected root are not treated as separate roots.
12. Applying the target state updates every selected root recursively, so each
    affected subtree ends in a uniform checked state.

## Commands

1. Toggle checked: `Cmd+Enter` (macOS), `Ctrl+Enter` (Windows/Linux).
2. With a caret/text selection, toggle checked updates the caret note and its
   descendants recursively.
3. With a note selection, toggle checked applies the computed target state to
   every selected root and each root's descendants.
