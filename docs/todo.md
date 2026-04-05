# TODO

## About this file (scratchpad)

This file is an intentionally messy scratchpad for in-flight work, not a spec.

Rules:

- Mark completed items as `✅ Done` while a section is still active.
- Delete sections once fully done (no archive here).
- Move durable decisions/specs into the relevant doc under `docs/`, leaving a
  link behind.

## Tooling

- Test matcher follow-up: revisit `toMatchOutline` support for generated note-id
  assertions so tests can express “some valid id was created here” without a
  separate manual sanity check. Example trigger:
  `tests/unit/internal/editor-notes-showcase.spec.ts`.
- Naming follow-up: consider renaming `boundaryRoot` to `zoomBoundaryRoot` in
  note operation helpers and SDK adapter plumbing where the boundary is always
  zoom-specific.

## Test doc-id lifecycle hygiene (deferred)

- Recent cleanup narrowed the problem:
  editor E2E now uses per-test random doc IDs plus explicit on-disk cleanup,
  and user-config gets a per-run E2E doc ID with teardown.
- Remaining issue: isolation policy is still split across ad hoc helpers
  (`createUniqueNoteId()`, `sessionStorage`-scoped user-config IDs, and manual
  `DATA_DIR/collab/<docId>` cleanup) instead of being owned by one
  environment/storage-level mechanism.
- Follow up on a single test-runtime strategy so per-run/per-test isolation,
  cleanup, and any repeatable-ID cases are driven from one place rather than
  feature-specific hooks.

## Search architecture

- Add a document-level SDK visitor/walker API and use it as the shared
  traversal primitive for search snapshot building and note-link candidate
  collection. Keep search/query semantics and note-link ranking/disambiguation
  outside the SDK.
- Make lexical note lookup indexed / amortized `O(1)` and move SDK handle reads
  (`textOf`, `childrenOf`, `hasNote`, `note(...)`) onto that path so search and
  other SDK consumers do not pay scan-based lookup costs per visited note.
- [Future] Evaluate unifying candidate discovery/query logic between search and
  link picker (search already uses SDK/Lexical candidates; link picker still
  uses its own traversal/filter pipeline).

## Dependency simplification follow-ups

- Revisit Lexical `0.42` for places where `$insertNodeIntoLeaf` could simplify
  current insertion/link-handling code without changing editor behavior.
- Revisit Vitest `4.1` test helpers (`test.extend`, `aroundEach`,
  `aroundAll`) to see whether they can simplify RemDo fixture typing and shared
  test setup/teardown.

## Collaboration architecture roadmap [Future]

- User-config runtime follow-up: observe remote/shared `documents` mutations in
  `src/documents/stored-user-config.ts` and refresh the local store version so
  document-switcher state stays current across tabs/sessions. Retry-on-startup
  recovery can land independently first.
- User-config route follow-up: handle rejected `documentList().create()` calls
  from the document picker in `src/routes/DocumentRoute.tsx` so sync/write
  failures do not surface as unhandled promise rejections and the UI can
  recover cleanly.

### Stages and success criteria

1. ✅ Done **Stage 0: single hub, online-first.**
   Success: one server is the single collaboration backend for docs.
2. ✅ Done **Stage 1: offline doc persistence.**
   Success: an already-opened doc can be edited offline and syncs on reconnect.
3. ✅ Done **Stage 2: offline app-shell loading.**
   Success: the app shell can open offline (for example via PWA caching), even
   before document data sync is available.
4. **Stage 3: multi-hub client.**
   Success: one client can browse/edit docs from multiple trusted hubs.
5. **Stage 4: local vault hub (optional).**
   Success: local-only docs behave like normal docs and remain device-local.

## Note-first SDK follow-ups

- Generic note handles, document-specific note kinds, and persisted user-config
  storage are in place. Remaining work:
  1. Introduce async walker/finder/query helpers for search and note-link
     completion so cross-document traversal does not force raw recursive
     `children()` traversal into callers.
  2. Settle long-term `DocumentNote` semantics for non-current documents:
     loading model, whether `children()` can hydrate, and which operations are
     allowed before document content is loaded.
  3. Clarify the remaining query/loading boundary:
     whether cross-document link search should load trees directly or use a
     separate index/search layer.
  4. Clarify mutation boundaries only as needed by the new traversal/query
     layer (single-note writes vs transactional/multi-note updates).
  5. Review the remaining top-level API naming after the note-owned
     `create(...)` refactor, especially `createLexicalEditorNotes` and
     `place(...)`.
  6. Update the durable docs once the traversal/query contract stabilizes:
     `docs/outliner/concepts.md`, `docs/architecture.md`,
     `docs/outliner/search.md`, and `docs/outliner/links.md`.
