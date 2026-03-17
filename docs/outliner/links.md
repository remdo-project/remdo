# Links

## Purpose

Define the initial note-linking behavior for RemDo, including the boundary
between RemDo-owned note links and generic external links.

## State boundary terms

1. **Runtime editor state:** the in-memory Lexical node state used by editor
   behavior and rendering.
2. **Persisted JSON state:** the JSON document shape written to/read from
   fixtures, snapshot files, and other long-lived storage boundaries.
3. **Clipboard payload:** transient copy/cut payload (`application/x-lexical-editor`)
   exchanged between editor contexts.
4. **Collaboration state:** shared runtime state (for example Yjs-backed) that
   must behave like runtime/editor state while synced.

## Core behavior

1. RemDo-owned links are note links targeting stable note identity
   (`docId` + `noteId`), not the visible link text.
2. Generic URL links do not use RemDo note-link semantics; they use normal
   Lexical link behavior, including generic URL autolinking.
3. RemDo classification runs before generic link handling so RemDo-owned note
   refs keep note-link identity/clipboard behavior instead of degrading into
   plain URL links.
4. Links are created inline through a keyboard-first typeahead flow triggered by
   `@`.
5. Link-query mode can start anywhere in note text. Query length minimum is 0,
   so results may appear immediately.
6. On insertion, note-link display text is copied once from the target note
   title and then
   stored locally (no auto-sync on later target renames in this phase).
7. Runtime/internal editor state stores fully qualified link identity
   (`docId` + `noteId`) for every note-link node.
8. Note-link clicks use native `href` navigation semantics and route handling.
9. Pasting a RemDo-owned plain-text note URL inserts a
   note-link node. When the target is in the current document, inserted
   link text copies the current target note title; otherwise it uses the pasted
   URL string.
10. Typed URLs use Lexical generic link behavior, including same-origin
    RemDo note URLs typed as raw URLs.
11. Pasted generic URLs that are not upgraded to note links use Lexical generic
    link behavior.
12. Generic URL links open in a new tab.
13. URLs that merely resemble RemDo note routes but are not classified by
    RemDo as owned note refs remain generic external links.
14. Clipboard payloads (copy/cut) must include explicit `docId` for every
   note link so cross-context paste has complete target identity.
15. Cross-document pastes preserve source-target link identity; note links
   are not retargeted to the destination document.

## Identity Representation Boundaries

1. Runtime/editor state keeps note links fully qualified (`docId` +
   `noteId`) to avoid context-dependent link resolution.
2. Persisted JSON state must omit `docId` when a link targets the active
   document. This keeps document identity host-owned rather than embedded as
   canonical content state.
3. At persisted->runtime boundaries (load/import), hosts must rehydrate missing
   same-document link `docId` values from the active `documentId` before
   parsing/applying state into the editor runtime.
4. Cross-document links keep explicit `docId` values unchanged across save/load.
5. At runtime->persisted boundaries (save/export), hosts must compact out
   same-document `docId` values before writing persisted JSON output.
6. Note/document identity ownership rules remain defined in
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

1. [Future] Backlinks are expected as part of the note-link model.
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
