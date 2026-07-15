# Zoom View (Subtree Isolation)

## Purpose

Define the user-visible behavior for isolating a single note and its
subtree. Zoom is both a presentation filter and an editing boundary: while
zoomed, editing stays inside the visible subtree. It is distinct from
caret/selection state in the editor.

## Definitions

- **Zoom target:** The noteId that identifies the current zoom root (the
  document root note represents the full document view).
- **Zoom root:** The note whose subtree is displayed for the current zoom
  target.
- **Zoom boundary:** The zoom root plus all of its descendants — the subtree
  edits are bounded to while zoomed.
- **View actions:** Commands that operate on the current zoom boundary rather
  than on a single note.
- **Zoom path:** The ordered list of ancestors from the document to the zoom
  root, used for breadcrumbs.

## Core behavior

1. **Document root zoom:** The full document tree is visible. This is the
   default view and the fallback when the zoom target is missing or invalid.
2. **Subtree zoom:** Only the zoom root and its descendants are visible. The
   zoom root defines the local view heading; its descendants keep their
   relative indentation within the subtree.
3. Zoom does not introduce a new note type or structural level. Note identities
   and collaboration semantics are unchanged.
4. While zoomed, selection expansion (including Select All) is bounded to the
   zoom root. Within that boundary, selection behavior matches
   [Selection](./selection.md).
5. While zoomed, edits are bounded to the zoom boundary. Commands MUST NOT
   create, merge, move, or target notes outside that boundary.
6. The current location renders as the [view header](#view-header) — an editable
   heading above the visible outline. The outline shows the current location's
   children.
7. If the zoom root has direct children, those children are always visible
   while zoomed, even when the zoom root's stored fold state is `folded`.
   Descendants beneath those children still follow their own fold states.
8. The zoom root's stored fold state is preserved while zoomed. Clearing zoom
   returns to the parent view with that fold state still in effect there.

## Entering and changing zoom

1. Clicking a note’s bullet zooms into that note (the clicked note becomes the
   zoom root).
2. While zoomed, clicking any visible note’s bullet re-zooms on that note.
3. When the zoom root has one or more visible direct children, entering zoom
   places the caret in the first visible child so work continues in the zoomed
   content immediately.
4. When the zoom root has no visible direct children, entering zoom places the
   caret in the [view header](#view-header) so editing can proceed there.

## View header

The **view header** is how the current location presents itself above its
children: an editable heading rendering the current note's own content, present
in every document view.

1. **What it shows.** The header renders the current location's own text and
   editing it edits that text in place. What the text may contain follows from
   the location's [kind](./concepts.md#note-kinds): a zoomed editor note carries
   the same inline content as any note (inline formatting and
   [note links](./links.md)); the document root carries whatever the document
   kind allows.
2. **Not a structural row.** The header is presented distinctly from ordinary
   note rows and is never one of them: it cannot be folded, indented, outdented,
   reordered, structurally deleted, or selected structurally, and no structural
   command targets it.
3. **`Enter` adds a first child.** `Enter` in the header creates an empty first
   child of the current location and moves the caret into it.
4. **`Shift+Enter` reaches the body.** Where the header's kind can own a
   [body](./body.md), `Shift+Enter` focuses it, adding one if absent — the same
   body gesture defined for note content.
5. **Body as summary.** When the header's note has a [body](./body.md), it
   renders beneath the header, above the children — the body's usual
   below-the-content position, applied to the header. It follows the same
   [body](./body.md) rules: it is reached by the gesture or a click, not by
   arrowing down from the header (which lands on the first child).
6. **`Backspace` at the header start is a no-op** — there is no note above the
   current location to merge into.

The view header does not apply to [Home](./home.md), which has no outline.

## Clearing zoom

1. Clicking the document breadcrumb (see below) sets the zoom target to the
   document root note.
2. If the zoom root is deleted or otherwise cannot be resolved, zoom resets to
   the document root note automatically.

## Zoom stability

Zoom changes only through explicit zoom navigation or when the zoom target can
no longer be resolved.

## Boundary-specific command rules

These govern commands run from the outline children. Commands run from the
[view header](#view-header) follow the header's own rules instead.

1. `Enter` boundary behavior is defined in [Insertion](./insertion.md).
2. `Backspace`/`Delete` boundary behavior is defined in
   [Deletion](./deletion.md).
3. Indent/outdent boundary behavior is defined in
   [Note Structure Rules](./note-structure-rules.md).
4. Reorder boundary behavior is defined in
   [Reordering](../../openspec/specs/outliner-reordering/spec.md).
5. When a command hits the boundary, the editor may show brief non-modal
   feedback, but the command result is always determined by the linked command
   specs.

## Breadcrumbs

The breadcrumb is pure navigation: the ancestor path above the current location,
every item a link.

1. **Document root zoom:** The breadcrumb trail contains a single crumb: Home.
2. **Subtree zoom:** The breadcrumb trail is the zoom path up to but excluding
   the zoom root, in order: Home / document name / ancestor notes.
3. Every breadcrumb item is a link:
   - The Home crumb opens [Home](./home.md).
   - The document name clears zoom.
   - Any ancestor note breadcrumb re-zooms on that note.

Breadcrumb labels other than Home use the same display text as the corresponding
outline note, truncated to 20 characters for display when needed.

## Routing

The canonical URL forms are owned by
[Note IDs](./note-ids.md#global-references); a zoom target is the `noteId` half
of a `noteRef`. Loading a non-root zoom URL activates zoom if the note exists;
otherwise the document opens at its canonical root URL. Clearing zoom on the
local Home document returns to `/`.
