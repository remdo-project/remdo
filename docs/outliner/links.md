# Links

## Purpose

Define note-linking behavior for RemDo, including the boundary between
RemDo-owned note links and generic external links.

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
4. Links are created inline through `@`, an inline trigger character; its
   open/close/confirm lifecycle is the shared one in
   [Editor popups](./popups.md). The note-link spec defines only what differs.
5. The query is the text after `@` in the pinned span, length minimum 0, so
   results may appear immediately. Whitespace is allowed in the query.
6. On insertion, note-link display text is copied once from the target note
   title and then stored locally; later target renames do not update it
   (rename-aware display modes are a Future direction below).
7. Note-link clicks use native `href` navigation semantics and route handling.
8. Pasting a RemDo-owned plain-text note URL inserts a
   note-link node. When the target is in the current document, inserted
   link text copies the current target note title; otherwise it uses the pasted
   URL string.
9. Typed URLs use Lexical generic link behavior, including same-origin
    RemDo note URLs typed as raw URLs.
10. Pasted generic URLs that are not upgraded to note links use Lexical generic
    link behavior.
11. Generic URL links open in a new tab.
12. URLs that merely resemble RemDo note routes but are not classified by
    RemDo as owned note refs remain generic external links.
13. Clipboard payloads (copy/cut) must include explicit `docId` for every
   note link so cross-context paste has complete target identity.
14. Cross-document pastes preserve source-target link identity; note links
   are not retargeted to the destination document.

## Identity Representation Boundaries

1. Runtime/editor state keeps note links fully qualified (`docId` +
   `noteId`).
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
2. Filtering uses the same path-token matching as document search (defined in
   [Search](./search.md#behavior)).
3. The current note is excluded from results (self-links are out of scope).
4. Picker rows show the minimal ancestor context needed to disambiguate duplicate
   titles in the current result set.
5. If results are still visually identical after full ancestor context, they
   remain untied and are shown in document order.
6. No-match state is a single non-selectable `No results...` row.
7. Creating new notes from the picker is out of scope.

## Picker interaction

The `@` picker is the type-to-filter specialization of the shared
[Editor popups](./popups.md) contract: it keeps DOM focus in the editor (the
combobox focus model) and its typed query is the pinned span's editable text.
Navigation, confirmation, and dismissal are the shared lifecycle; note-link
specifics:

1. The initial active option is the first result in document order.
2. `Enter` or a primary-button click commits the active option; `Tab` does not
   commit — it closes the picker and falls through to indent.
3. On the no-match state (the `No results...` row, with no active option),
   `Enter` closes the picker and leaves the typed `@query` as ordinary text — it
   neither inserts a link nor a newline.
4. Confirming inserts a note-link node (`docId` + `noteId`) whose display text is
   the target note title, plus a trailing space.

## Non-goals / future

1. [Future] Backlinks are expected as part of the note-link model.
2. [Future] Cross-document discovery/insertion in the `@` picker.
3. [Future] Fuzzy matching in picker search.
4. [Future] Frecency-aware ranking. When this ships, zoom context should
   influence ordering but must not reduce search scope.
5. [Future] Rename-aware display text modes (for example title-mirroring unless
   user-customized).
6. [Future] Ensure floating controls/overlays never block pointer hit-testing
    for inline links, so plain user clicks and test `link.click()` are reliable.
7. [Future] Improve cross-document link UX beyond identity correctness
   (validation, richer previews, and authoring ergonomics).
