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

## Query and ranking

1. Search scope is the whole current document, including while zoomed into a
   subtree.
2. v1 ranking uses no scoring; after filtering, results keep document order.
3. Picker rows show the minimal ancestor context needed to disambiguate duplicate
   titles in the current result set.
4. If results are still visually identical after full ancestor context, they
   remain untied and are shown in document order.
5. No-match state is a single non-selectable `No results...` row.
6. Creating new notes from the picker is out of scope in this phase.
7. Query text accepts spaces and punctuation.

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

## Current bugs

1. After `Backspace` exits empty-query mode, typing the next character can
   incorrectly reactivate link-query mode from an existing plain `@` token.
   This keeps picker key handling active and breaks the expected plain-text flow
   (for example email-like text input).

## Non-goals / future

1. [Future] Backlinks are expected as part of the internal-link model.
2. [Future] Links to notes in other documents.
3. [Future] Fuzzy matching in picker search.
4. [Future] Frecency-aware ranking. When this ships, zoom context should
   influence ordering but must not reduce search scope.
5. [Future] Rename-aware display text modes (for example title-mirroring unless
   user-customized).
6. [Future] Externally recognizable note URLs for deep-linking (for example
   `/n/<docId>_<noteId>`), replacing query-param zoom links.
7. [Future] Consolidate routing and internal-link identity contracts so both
   layers share aligned encoding/parsing rules and tests.
8. [Future] Store real app routes in link `href` values so links can use native
   browser navigation semantics instead of custom internal schemes.
9. [Future] Once native `href` navigation is in place and reliable, remove
   custom JS link-click interception and rely on router handling.
10. [Future] Ensure floating controls/overlays never block pointer hit-testing
    for inline links, so plain user clicks and test `link.click()` are reliable.
