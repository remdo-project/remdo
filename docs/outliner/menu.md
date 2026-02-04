# Note Menu

## Entry

1. Clicking the menu icon beside a note row opens the menu for that note. The
   icon appears on hover or when the note is the caret/focus target.
2. Double-Shift within 500ms opens the menu for the caret note when the editor
   is focused; any other key between the two Shift presses cancels the gesture.

## Actions

1. Fold/Unfold toggles per `./folding.md`, hidden for leaf notes, shortcut `F`.
2. Children list type actions switch the note's immediate children to bullet, numbered, or checked lists,
   showing only the two non-current options; hidden for leaf notes.
3. Zoom per `./zoom.md`, shortcut `Z`.
4. Menu labels visually mark the shortcut letter.

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
