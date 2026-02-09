# Links

## Purpose

Define the initial internal note-linking behavior for RemDo.

## Core behavior

1. Links are created inline through a keyboard-first typeahead flow triggered by
   `@`.
2. Link-query mode can start anywhere in note text. Query length minimum is 0,
   so results may appear immediately.
3. Inserted links target stable note identity (`noteId`/equivalent), not plain
   text labels.
4. On insertion, display text is copied once from the target note title and then
   stored locally (no auto-sync on later target renames in this phase).
5. Inserted links store app-route `href` values using note refs
   (`/n/<docId>_<noteId>`), not custom internal URL schemes.
6. Link clicks use native `href` navigation semantics and route handling.

## Query and ranking

1. Search scope is the whole current document, including while zoomed into a
   subtree.
2. The current note is excluded from results (self-links are out of scope in
   this phase).
3. v1 ranking uses no scoring; after filtering, results keep document order.
4. Picker rows show the minimal ancestor context needed to disambiguate duplicate
   titles in the current result set.
5. If results are still visually identical after full ancestor context, they
   remain untied and are shown in document order.
6. No-match state is a single non-selectable `No results...` row.
7. Creating new notes from the picker is out of scope in this phase.
8. Query text accepts spaces and punctuation.

## Picker interaction

1. When filtered results are non-empty, picker always has an active selection
   (initially the first result in document order).
2. Arrow navigation is clamped at list boundaries (no wrap-around).
3. `Enter` confirms the active option.
4. `Tab` confirms the active option (same behavior as `Enter`).
5. `Escape` exits link-query mode and removes the current `@query` token.
6. `Backspace` on an empty query exits link-query mode but leaves `@` as plain
   text.
7. `Home` and `End` keep normal text-caret behavior and do not move picker
   selection.
8. Pointer hover updates the active picker row.
9. Primary-button pointer click on a selectable row confirms that option (same
   as `Enter`/`Tab`).

## Non-goals / future

1. [Future] Backlinks are expected as part of the internal-link model.
2. [Future] Links to notes in other documents.
3. [Future] Fuzzy matching in picker search.
4. [Future] Frecency-aware ranking. When this ships, zoom context should
   influence ordering but must not reduce search scope.
5. [Future] Rename-aware display text modes (for example title-mirroring unless
   user-customized).
6. [Future] Ensure floating controls/overlays never block pointer hit-testing
    for inline links, so plain user clicks and test `link.click()` are reliable.
