# Quick Action Menu

## Entry

1. RemDo exposes a single quick action menu that can be opened from either a
   note row or the keyboard.
2. Clicking the menu icon beside a note row opens the quick action menu
   anchored to that row. The icon appears on hover or when the note is the
   caret/focus target.
3. Double-Shift within 500ms opens the same quick action menu for the caret
   context when the editor is focused; any other key between the two Shift
   presses cancels the gesture.

## Actions

1. The menu may include actions with three scopes:
   - **Note:** acts on the current note.
   - **Children:** acts on the current note's child subtree.
   - **View:** acts on the current zoom boundary.
2. Note actions:
   - Toggle checked recursively per `./list-types.md`, shortcut
     `Cmd/Ctrl+Enter`.
   - Fold/Unfold per `./folding.md` (`toggle` state), hidden for leaf notes and
     for the current zoom root, shortcut `F` when the menu is open.
   - Zoom per `./zoom.md`, shortcut `Z`.
3. Children actions:
   - Child list type actions per `./list-types.md`, showing only the two
     non-current options; hidden for leaf notes.
4. View actions:
   - `Fold to level [0-9]` per `./folding.md`, with digit shortcuts scoped to
     the current zoom boundary. Clicking the action applies level `1`.
5. Menu labels visually mark shortcut letters where applicable.

## Behavior

1. The menu anchors to the triggering note row near the icon.
2. The menu closes on click outside, `Escape`, selection change, blur, or after
   executing an action.
3. Arrow keys move, `Enter` activates, `Escape` closes, and shortcut letters
   activate immediately.
4. When opened from a row, the current note is that row's note. When opened
   from double-Shift, the current note is the caret note.
5. Structural selections never open multi-note menus; only the focus note is
   used as note context.
6. View actions are not limited to the current note. They act on the current
   zoom boundary even when the menu is opened from a specific row.
7. While the menu is open, `1`-`9` apply the chosen level and `0` fully
   unfolds the current zoom boundary.

## Non-goals

1. Recursive fold/unfold or bulk actions are out of scope.
