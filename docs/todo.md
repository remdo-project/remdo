# TODO

## About this file (scratchpad)

This file is an intentionally messy scratchpad for in-flight work, not a spec.

Rules:

- Mark completed items as `✅ Done` while a section is still active.
- Delete sections once fully done (no archive here).
- Move durable decisions/specs into the relevant doc under `docs/`, leaving a
  link behind.

## Tooling

- Consolidate repeated unit-test Lexical DOM setup (`document.createElement` +
  `document.body.append` + `createEditor` + `setRootElement`) into a shared
  test helper with a single cleanup path.
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

## Collaboration architecture roadmap [Future]

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
  2. Keep async behavior out of the raw `Note` handle and keep adapter
     boundaries internal to the SDK/domain layer.
  3. Settle long-term `DocumentNote` semantics for non-current documents:
     loading model, whether `children()` can hydrate, and which operations are
     allowed before document content is loaded.
  4. Clarify the remaining query/loading boundary:
     whether cross-document link search should load trees directly or use a
     separate index/search layer.
  5. Clarify mutation boundaries only as needed by the new traversal/query
     layer (single-note writes vs transactional/multi-note updates).
  6. Review the remaining top-level API naming after the note-owned
     `create(...)` refactor, especially `createLexicalEditorNotes`, `place(...)`,
     and `getUserConfig`.
  7. Update the durable docs once the traversal/query contract stabilizes:
     `docs/outliner/concepts.md`, `docs/architecture.md`,
     `docs/outliner/search.md`, and `docs/outliner/links.md`.
  8. Keep the solution narrow:
     avoid speculative hierarchy/adapter flexibility until a concrete caller
     needs it.
