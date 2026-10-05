# Keyboard reference

The keyboard reference lists the shortcuts of an open document view. Other
owners define the bindings; it owns only availability, grouping, and platform
presentation.

## Presence

1. A document view has a control that opens and closes the reference. [Home](./home.md) has none.
2. Touch devices, as defined by the [mobile toolbar's presence](./mobile-toolbar.md#presence), have none.
3. The reference is non-modal: it stays open while the user edits and closes
   only through its control or `Escape` from within it. Opening moves focus into
   it; closing returns DOM focus to the editor and leaves the
   [focus note](./selection.md#selection-states) unchanged.

## Content

1. Entries form these groups, in this order:
   - **Essentials:**
     - [note actions](./menu.md#entry)
     - [new note](./insertion.md)
     - [indent and outdent](./indentation.md#input-bindings)
     - [move up and down](./reordering.md)
     - [toggle checked](./list-types.md#keyboard-command)
     - [find in document](./search.md#behavior)
     - [search documents](./search.md#document-scope)
     - [add or open body](./body.md#core-behavior)
     - [link a note](./links.md)
     - [insert a date](./dates.md)
   - **Editing:** undo, redo, bold, italic, underline, copy, cut, and paste, using
     the platform's standard bindings.
   - **Selection:** expand selection, select text, select notes, select to a
     note, and leave selection per [Selection](./selection.md#input-bindings),
     and [delete selection](./deletion.md#structural-selection).
   - **Note actions:** the [quick action menu](./menu.md#actions)'s own keys:
     fold or unfold, zoom, zoom out, fold to level, unfold all, choose, run,
     and close. Its entries state how the menu opens, because these keys apply
     only while it is open.
2. An entry names its action and shows the binding the editor honors on the
   viewer's platform. **Deterministic.**
3. An entry for a quick action menu action uses that action's menu label.
4. Entries expose their action and keys to assistive technology as one pair.

## Platform

The reference shows only the bindings of the viewer's platform, macOS or
Windows/Linux, as the editor's own shortcut handling determines it.

## Future

- A keyboard path to open the reference, once an entry that does not conflict
  with typing is chosen.
