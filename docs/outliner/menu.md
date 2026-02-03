# Note Menu

## Entry

1. Clicking the menu icon beside a note row opens the menu for that note.
2. Double-Shift within 500ms opens the menu for the caret note when the editor
   is focused; any other key between the two Shift presses cancels the gesture.

## Actions

1. Fold/Unfold toggles per `./folding.md`, hidden for leaf notes, shortcut `F`.
2. Zoom per `./zoom.md`, shortcut `Z`.
3. Menu labels visually mark the shortcut letter.

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
