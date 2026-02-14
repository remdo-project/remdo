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
5. Runtime/internal editor state stores fully qualified link identity
   (`docId` + `noteId`) for every internal link node.
6. Link clicks use native `href` navigation semantics and route handling.
7. Pasting a plain-text internal note URL (`/n/<docId>_<noteId>`) inserts an
   internal link node. When the target is in the current document, inserted
   link text copies the current target note title; otherwise it uses the pasted
   URL string.
8. Clipboard payloads (copy/cut) must include explicit `docId` for every
   internal link so cross-context paste has complete target identity.
9. Cross-document pastes preserve source-target link identity; internal links
   are not retargeted to the destination document.

## Identity Representation Boundaries

1. Runtime/editor state keeps internal links fully qualified (`docId` +
   `noteId`) to avoid context-dependent link resolution.
2. Persisted document state must omit `docId` when a link targets the active
   document. This keeps document identity host-owned rather than embedded as
   canonical content state.
3. On document load/import, the host/editor adapter must rehydrate missing
   same-document link `docId` values from the active runtime `documentId`
   before normal editor behavior runs.
4. Cross-document links keep explicit `docId` values unchanged across save/load.
5. Note/document identity ownership rules remain defined in
   [Note IDs](./note-ids.md).

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
7. Pointer hover updates the active picker row.
8. Primary-button pointer click on a selectable row confirms that option (same
   as `Enter`/`Tab`).
9. Picker semantics expose the active row via listbox `aria-activedescendant`;
   selectable rows also expose active state with `aria-selected`.
10. `Enter`/`Tab` on a no-results picker exits link-query mode and leaves the
    typed `@query` text unchanged.
11. Clicking outside the editor and picker exits link-query mode and leaves the
    typed `@query` text unchanged.
12. Editor blur exits link-query mode and leaves the typed `@query` text
    unchanged.

## Non-goals / future

1. [Future] Backlinks are expected as part of the internal-link model.
2. [Future] Cross-document discovery/insertion in the `@` picker (search scope
   and ranking currently apply only to the active document).
3. [Future] Fuzzy matching in picker search.
4. [Future] Frecency-aware ranking. When this ships, zoom context should
   influence ordering but must not reduce search scope.
5. [Future] Rename-aware display text modes (for example title-mirroring unless
   user-customized).
6. [Future] Ensure floating controls/overlays never block pointer hit-testing
    for inline links, so plain user clicks and test `link.click()` are reliable.
7. [Future] Improve cross-document link UX beyond identity correctness
   (validation, richer previews, and authoring ergonomics).
