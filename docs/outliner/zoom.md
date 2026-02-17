# Zoom View (Subtree Isolation)

## Purpose

Define the user-visible behavior for isolating a single note and its
subtree. Zoom is both a presentation filter and an editing scope boundary:
while zoomed, editing stays inside the visible subtree. It is distinct from
caret/selection state in the editor.

## Definitions

- **Zoom target:** The noteId that identifies the current zoom root (the
  document root note represents the full document view).
- **Zoom root:** The note whose subtree is displayed for the current zoom
  target.
- **Zoom boundary:** The zoom root plus all of its descendants.
- **Zoom path:** The ordered list of ancestors from the document to the zoom
  root, used for breadcrumbs.

## Core behavior

1. **Document root zoom:** The full document tree is visible. This is the
   default view and the fallback when the zoom target is missing or invalid.
2. **Subtree zoom:** Only the zoom root and its descendants are visible. The
   zoom root is rendered at depth 0; its descendants keep their relative
   indentation within the subtree.
3. Zoom does not introduce a new note type or structural level. Note identities
   and collaboration semantics are unchanged.
4. While zoomed, selection expansion (including Select All) is bounded to the
   zoom root. Within that boundary, selection behavior matches
   [Selection](./selection.md).
5. While zoomed, edits are bounded to the zoom boundary. Commands must not
   create, merge, move, or target notes outside that boundary.

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

## Zoom stability

1. Local edits do not change zoom automatically.
2. Collaboration updates do not change zoom automatically.
3. Zoom changes only through explicit zoom navigation or when the zoom target
   can no longer be resolved.

## Boundary-specific command rules

1. `Enter` boundary behavior is defined in [Insertion](../insertion.md).
2. `Backspace`/`Delete` boundary behavior is defined in
   [Deletion](./deletion.md).
3. Indent/outdent boundary behavior is defined in
   [Note Structure Rules](./note-structure-rules.md).
4. Reorder boundary behavior is defined in [Reordering](./reordering.md).
5. When a command hits the boundary, the editor may show brief non-modal
   feedback, but the command result is always determined by the linked command
   specs.

## Breadcrumbs

1. **Document root zoom:** The breadcrumb trail contains a single item: the
   document name.
2. **Subtree zoom:** The breadcrumb trail expands to include the zoom path in
   order: document name → ancestor notes → zoom root (included).
3. Each breadcrumb item is clickable:
   - Document name clears zoom.
   - Any ancestor note breadcrumb re-zooms on that note.
   - The zoom root breadcrumb is the current location and is not a link.

Breadcrumb labels use the same display text as the corresponding outline note,
truncated to 20 characters for display when needed.

## Routing

1. For non-root zoom, the canonical URL is `/n/<docId>_<noteId>` (a single
   zoom target noteId, not a full path).
2. For document-root zoom, the canonical URL is `/n/<docId>`.
3. Loading `/n/<docId>_<noteId>` activates zoom if the note exists; otherwise
   the document opens at the document root.
