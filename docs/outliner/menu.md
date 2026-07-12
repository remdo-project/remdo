# Quick Action Menu

Defines RemDo's single quick action menu: a per-note action popup opened from a
note row or the keyboard. The menu is an [editor popup](./popups.md) and
follows the shared editor-popup contract; this doc defines only the menu's own
entry, actions, and behavior.

## Entry

1. Clicking the menu icon beside a note row opens the quick action menu
   anchored to that row. The icon appears on hover or when the note is the
   caret/focus target.
2. Double-Shift within 500ms opens the same quick action menu for the caret
   context when the editor is focused; any other key between the two Shift
   presses cancels the gesture.

## Actions

1. Menu actions have three scopes:
   - **Note:** acts on the current note.
   - **Children:** acts on the current note's child subtree.
   - **View:** acts on the current [zoom](./zoom.md) boundary.
2. Note actions:
   - Toggle checked recursively per [List Types](./list-types.md), shortcut
     `Cmd/Ctrl+Enter`.
   - Fold/Unfold per [Folding](./folding.md) (`toggle` state), hidden for leaf
     notes and for the current zoom root, shortcut `F` when the menu is open.
   - Zoom per [Zoom](./zoom.md), shortcut `Z`.
3. Children actions:
   - Child list type actions per [List Types](./list-types.md), showing only
     the two non-current options; hidden for leaf notes.
4. View actions:
   - `Fold to level [0-9]` per [Folding](./folding.md), with digit shortcuts
     scoped to the current zoom boundary. Clicking the action applies level `1`.
5. Menu labels visually mark shortcut letters where applicable.

## Behavior

1. The menu anchors to the triggering note row near the icon.
2. The menu uses the WAI-ARIA menu pattern: it has no query span; focus moves
   into the menu (roving over the items). `ArrowUp`/`Down`
   move the active item, `Enter`/`Space` activate it, `Tab` closes the menu and
   returns focus to the editor. Beyond the contract: executing an action also
   closes it, and the shortcut letters and digits below activate their action
   immediately (these accelerators replace the menu pattern's optional
   first-letter type-ahead).
3. When opened from a row, the current note is that row's note. When opened
   from double-Shift, the current note is the caret note.
4. Structural selections never open multi-note menus; only the focus note is
   used as note context.
5. While the menu is open, `1`-`9` apply the chosen level and `0` fully
   unfolds the current zoom boundary.

## Non-goals

1. Recursive fold/unfold or bulk actions are out of scope.
