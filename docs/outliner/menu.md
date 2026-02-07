# Note Menu

## Entry

1. Clicking the menu icon beside a note row opens the menu for that note. The
   icon appears on hover or when the note is the caret/focus target.
2. Double-Shift within 500ms opens the menu for the caret note when the editor
   is focused; any other key between the two Shift presses cancels the gesture.

## Actions

1. Toggle checked per `./list-types.md`, shortcut `Cmd/Ctrl+Enter`.
2. Fold/Unfold per `./folding.md` (`toggle` state), hidden for leaf notes, shortcut `F`.
3. Children list type actions per `./list-types.md`, showing only the two
   non-current options; hidden for leaf notes.
4. Zoom per `./zoom.md`, shortcut `Z`.
5. Menu labels visually mark shortcut letters where applicable.

## Behavior

1. The menu anchors to the triggering note row near the icon.
2. The menu closes on click outside, `Escape`, selection change, blur, or after
   executing an action.
3. Arrow keys move, `Enter` activates, `Escape` closes, and shortcut letters
   activate immediately.
4. Structural selections never open multi-note menus; only the focus note is
   targeted.

## Non-goals

1. Recursive fold/unfold or bulk actions are out of scope.
