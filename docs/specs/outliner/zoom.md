# Zoom

A document view can isolate a note and its
[subtree](./note-model.md#definitions). Zoom is a presentation filter and
editing boundary, distinct from the editor's [selection](./selection.md).

## Definitions

- **Zoom target:** The [`noteId`](./note-ids.md#definitions) identifying the
  current zoom root. The [document root](./note-model.md#definitions) represents the document-root view.
- **Zoom root:** The note whose subtree is displayed for the zoom target.
- **Zoom boundary:** The zoom root and all its descendants.
- **View actions:** Commands operating on the zoom boundary rather than one
  [editor note](./note-model.md#note-kinds).
- **Zoom path:** The ordered ancestors from the document to the zoom root, used
  for breadcrumbs.

## Visibility and editing boundary

1. The **document-root view** displays the full document tree. It is the default
   and the fallback for a missing or invalid zoom target.
2. A **subtree view** displays only the zoom root and its descendants. The zoom
   root defines the current location, and descendants retain their relative indentation.
3. Zoom does not add a note kind or structural level. Note identity and
   collaboration semantics remain unchanged.
4. Selection expansion, including Select All, stays inside the zoom boundary.
5. Edits stay inside the zoom boundary: commands do not create, merge, move,
   or target notes outside it.
6. The current location renders through the [view header](./view-header.md),
   with its children in the outline below.
7. A zoom root's direct children remain visible even when the root's stored
   fold state is `folded`. Deeper descendants follow their own fold states.
8. Zoom preserves the root's stored fold state. Leaving that view restores the
   state in its parent view.

## Entering and changing zoom

1. Clicking a visible editor note's bullet makes that note the zoom root.
2. When the new zoom root has visible direct children, the caret moves to the
   first one.
3. When it has none, the caret moves to the [view header](./view-header.md).

## Clearing zoom

Re-selecting the current document in the document picker, or opening that
document from [Home](./home.md), sets the zoom target to the document root.
If the zoom root no longer resolves, zoom also resets to the document root.

Zoom otherwise changes only through explicit zoom navigation.

## Command boundaries

Commands run from outline children use their capability's boundary rules:

1. [Insertion](./insertion.md) owns `Enter`.
2. [Deletion](./deletion.md) owns `Backspace` and `Delete`.
3. [Indentation](./indentation.md) owns indent and outdent.
4. [Reordering](./reordering.md) owns directional movement.

Commands from the [view header](./view-header.md) use its rules. A command may
show brief non-modal feedback at a boundary, but its owning specification
determines the result.

## Breadcrumbs

The breadcrumb is navigation through the ancestors above the current location.

1. The document-root view contains only the Home crumb.
2. A subtree view contains the zoom path without the zoom root, in order:
   Home / document name / ancestor notes.
3. Home opens [Home](./home.md). The document name is the document picker;
   choosing the current document clears zoom. An ancestor note changes the
   zoom root to that note.

Labels other than Home use the corresponding note's display text, truncated to
20 characters when needed.

## Routing

[Note IDs](./note-ids.md#global-references) owns canonical URL forms. A zoom
target is the `noteId` half of a `noteRef`. Loading a non-root zoom URL activates
zoom when the note exists and otherwise opens the document at its canonical root
URL. Clearing zoom on the local Home document returns to `/`.
