# Quick Action Menu

RemDo has one quick action menu: an action popup for a note row or the current
[selection](./selection.md), with actions for the current note or view. The menu
is an [editor popup](./popups.md) and follows its shared contract; it owns only
its entry, actions, and behavior.

## Entry

1. Clicking the menu icon beside a note row opens the quick action menu
   anchored to that row. The icon appears on hover or when the note is the
   caret/focus target.
2. Double-Shift within 500ms opens the same quick action menu for the current
   selection when the editor is focused. Any other key between the two Shift
   presses cancels the gesture.

## Actions

1. Menu actions have three scopes:
   - **Note:** acts on the current note, unless the action defines a wider target.
   - **Children:** acts on the current note's child list.
   - **View:** acts on the current [zoom boundary](./zoom.md#definitions).
2. When opened from a [view header](./view-header.md#structural-boundary), Note
   and Children actions are unavailable; View actions remain available.
3. Note actions:
   - Toggle checked per [List types](./list-types.md#toggling): targets the
     [selected note range](./selection.md#note-ranges) when the current note is
     inside a [structural selection](./selection.md#selection-states), otherwise the current note; shortcut `Cmd/Ctrl+Enter`.
   - Fold/Unfold per [Folding](./folding.md), hidden for leaf notes and for the
     current [zoom root](./zoom.md#definitions), shortcut `F` when the menu is open.
   - Zoom per [Zoom](./zoom.md), shortcut `Z`.
4. Children actions:
   - Child list type actions per [List types](./list-types.md#type-conversion), showing only
     the two non-current options; hidden for leaf notes.
5. View actions:
   - `Fold to level [0-9]` per [Folding](./folding.md), with digit shortcuts
     scoped to the current zoom boundary. Clicking the action applies level `1`.
6. Menu labels visually mark shortcut letters where applicable.

## Behavior

1. The menu anchors to the current note's row near the icon. When opened from a
   view header, it anchors near the header content.
2. The menu uses the WAI-ARIA menu pattern: it has no query span; focus moves
   into the menu (roving over the items). `ArrowUp`/`Down`
   move the active item, `Enter`/`Space` activate it, `Tab` closes the menu and
   returns focus to the editor. Beyond the contract: executing an action also
   closes it, and the shortcut letters and digits below activate their action
   immediately (these accelerators replace the menu pattern's optional
   first-letter type-ahead).
   Executing an action returns DOM focus to the editor and leaves the
   [focus note](./selection.md#selection-states) unchanged, whether the action was
   activated by keyboard or by pointer, and regardless of where focus was when
   the menu opened. An action that itself moves the caret (Zoom) sets the new
   focus note.
3. When opened from a row, the current note is that row's note. When opened
   without a row and outside a view header, the current note is the
   [focus note](./selection.md#selection-states). A view-header menu has no current note.
4. Selected note ranges never open multi-note menus; only the current note is
   used as note context, even when an action's target widens per its contract
   (as Toggle checked's does).

## Action targets

The menu does not add recursive fold or unfold operations or a multi-note menu
surface. Each action's specification owns what the action targets.
