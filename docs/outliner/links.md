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
4. Links are created inline through `@`, an inline trigger character; its
   open/close/confirm lifecycle is the shared one in
   [Inline trigger pickers](./triggers.md) (so an email-like `a@b` stays plain
   text). The note-link spec defines only what differs.
5. Query length minimum is 0, so results may appear immediately.
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
2. Filtering uses the same path-token matching as document search (defined in
   [Search](./search.md#behavior)): a note matches when every query token is a
   substring of some entry in its path (ancestor titles + the note's own title)
   and at least one token matches the note's own title. So typing an ancestor's
   word alongside a word from the note surfaces that nested note.
3. The current note is excluded from results (self-links are out of scope in
   this phase).
4. Picker rows show the minimal ancestor context needed to disambiguate duplicate
   titles in the current result set.
5. If results are still visually identical after full ancestor context, they
   remain untied and are shown in document order.
6. No-match state is a single non-selectable `No results...` row.
7. Creating new notes from the picker is out of scope in this phase.

## Picker interaction

Navigation, confirmation, accessibility, and dismissal are the shared trigger
lifecycle in [Inline trigger pickers](./triggers.md). Note-link-specific points:

1. The initial active option is the first result in document order.
2. Confirming inserts a note-link node (`docId` + `noteId`) whose display text is
   the target note title, plus a trailing space.

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
