# Quick Action Menu

RemDo has one quick action menu: an action popup for an editor-note row, a
document view's [location header](./location-header.md), a [Home](./home.md) document row, or the current
[selection](./selection.md). It owns entry, action availability, targeting, and focus behavior.
When opened for an editor note, it is an [editor popup](./popups.md) and follows that shared
contract.

## Entry

1. Menu buttons use the same More icon in the leading gutter of their row or
   header. Revealing a button does not shift the content. Activating it opens
   the menu for the represented note.
2. On hover-capable devices, one active menu button remains visible beside its
   target. Hovering another note or keyboard navigation moves it; leaving the
   row or page preserves the target. Only an open menu/dialog holds its target;
   restored button focus does not block subsequent hover. Keyboard input
   reveals the focused target before acting. Initially use the document heading,
   or the caret note when
   editing starts; Home uses its first document row. A removed or hidden target
   falls back to an available target. The button scrolls with its note.
   Header and Home row buttons remain keyboard reachable while visually hidden.
   Without hover, header and Home row buttons remain visible; editor actions
   remain available for the caret target and through the [touch toolbar](./mobile-toolbar.md).
3. Double-Shift within 500ms opens the same quick action menu for the current
   selection when the editor is focused. Any other key between the two Shift
   presses cancels the gesture.
4. Header and Home row menu buttons support `Enter` and `Space` when focused.

## Actions

1. Menu actions have three scopes:
   - **Note:** acts on the current note, unless the action defines a wider target.
   - **Children:** acts on the current note's child list.
   - **View:** acts on the current [zoom boundary](./zoom.md#definitions).
2. Actions follow the target's [note kind](./note-model.md#note-kinds) and capabilities. Editor-note and
   child-list-type actions require an editor-note target; document actions
   require a document target. View actions require an open document view. A
   header supplies its represented note as the target, subject to the
   [header's structural boundary](./location-header.md#structural-boundary).
3. Note actions:
   - Toggle checked per [List types](./list-types.md#toggling): targets the
     [selected note range](./selection.md#note-ranges) when the current note is
     inside a [structural selection](./selection.md#selection-states), otherwise the current note; shortcut `Cmd/Ctrl+Enter`.
   - Fold/Unfold per [Folding](./folding.md), hidden when single-note folding is
     unavailable, shortcut `F` when the menu is open.
   - Zoom per [Zoom](./zoom.md), shortcut `Z`.
   - Rename… for a document, per [Document rename](./location-header.md#document-rename).
   - Share… for a document the current user owns, per [Document sharing](../access/access-control.md#document-sharing).
   - Delete… for a document the current user owns, per [Document deletion](../access/access-control.md#document-deletion).
4. Children actions:
   - Child list type actions per [List types](./list-types.md#type-conversion), showing only
     the two non-current options; hidden for leaf notes.
5. View actions:
   - Zoom out per [Zoom](./zoom.md#zooming-out), shortcut `O` when the menu is
     open.
   - `Fold to level [0-9]` per [Folding](./folding.md), with digit shortcuts
     scoped to the current zoom boundary. Clicking the action applies level `1`.
6. Menu labels visually mark shortcut letters where applicable.

## Behavior

1. The menu anchors to the current note's row near the icon. When opened from a
   location header, it anchors near the header content.
2. The menu uses the WAI-ARIA menu pattern: it has no query span; focus moves
   into the menu (roving over the items). `ArrowUp`/`Down`
   move the active item, `Enter`/`Space` activate it, and `Tab` closes the menu.
   `Escape` or a pointer press outside dismisses it without an action.
   Executing an action closes it, and the shortcut letters and digits activate
   their action immediately (these accelerators replace the menu pattern's optional
   first-letter type-ahead).
   Closing an editor-note menu returns DOM focus to the editor and leaves the
   [focus note](./selection.md#selection-states) unchanged, whether the action was
   activated by keyboard or by pointer, and regardless of where focus was when
   the menu opened, unless the action defines a different focus or caret destination.
   Closing a document-root header or Home row menu returns focus to its invoking
   button, or the current destination's heading if that button no longer exists,
   unless the action defines another destination. A dialog action moves focus
   into its dialog.
3. When opened from a row, the current note is that row's note. When opened
   from a location header, it is the represented document root or zoomed editor
   note. Otherwise, the current note is the [focus note](./selection.md#selection-states). Header and Home row
   targets are independent of any editor selection; actions revalidate their
   target and availability when invoked.
4. Selected note ranges never open multi-note menus; only the current note is
   used as note context, even when an action's target widens per its contract
   (as Toggle checked's does).

## Action targets

The menu does not add recursive fold or unfold operations or a multi-note menu
surface. Each action's specification owns what the action targets.
