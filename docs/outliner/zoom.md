# Zoom View (Subtree Isolation)

## Purpose

Define the user-visible behavior for isolating a single note and its
subtree. This “zoom view” is a presentation filter only; it never changes the
underlying outline structure. It is distinct from caret/selection state in the
editor.

## Definitions

- **Zoom target:** The noteId that identifies the current zoom root (the
  document root note represents the full document view).
- **Zoom root:** The note whose subtree is displayed for the current zoom
  target.
- **Zoom path:** The ordered list of ancestors from the document to the zoom
  root, used for breadcrumbs.

## Core behavior

1. **Document root zoom:** The full document tree is visible. This is the
   default view and the fallback when the zoom target is missing or invalid.
2. **Subtree zoom:** Only the zoom root and its descendants are visible. The
   zoom root is rendered at depth 0; its descendants keep their relative
   indentation within the subtree.
3. Zoom is a view filter: structural edits, note identities, and collaboration
   semantics are unchanged. Operations apply to the same underlying notes as in
   the full document view.
4. While zoomed, selection expansion (including Select All) is bounded to the
   zoom root. Within that boundary, selection behavior matches
   [Selection](./selection.md).

## Entering and changing zoom

1. Clicking a note’s bullet zooms into that note (the clicked note becomes the
   zoom root).
2. While zoomed, clicking any visible note’s bullet re-zooms on that note.
3. Zooming into a note sets the caret within the zoom root so editing can
   proceed immediately there.

## Clearing zoom

1. Clicking the document breadcrumb (see below) sets the zoom target to the
   document root note.
2. If the zoom root is deleted or otherwise cannot be resolved, zoom resets to
   the document root note automatically.

## Auto-expanding zoom

1. If an edit affects notes outside the visible subtree, zoom expands to the
   nearest ancestor that contains the zoom root and the affected notes.
2. If the zoom root is reparented, zoom expands to its new parent (or the
   document root note when it becomes top-level) so the change is visible.

## Breadcrumbs

1. **Document root zoom:** The breadcrumb trail contains a single item: the
   document name.
2. **Subtree zoom:** The breadcrumb trail expands to include the zoom path in
   order: document name → ancestor notes → zoom root (included).
3. Each breadcrumb item is clickable:
   - Document name clears zoom.
   - Any ancestor note breadcrumb re-zooms on that note.
   - The zoom root breadcrumb is the current location and is not a link.

Breadcrumb labels use the same display text as the corresponding outline note.

## Routing

1. The URL must include the zoom target noteId whenever the zoom target is not
   the document root note (a single noteId, not a full path).
2. Zooming to the document root note removes the zoom noteId from the URL.
3. Loading a URL with a zoom noteId activates zoom if the note exists;
   otherwise the document opens at the document root.

## Non-goals

- Zoom does not introduce a new note type or a new structural level.
