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
- Clean up port assignment flow across `tools/env.defaults.sh`, `tools/env.sh`,
  and Playwright webServer startup so derived ports are always recomputed from a
  single base without manual `env -u ...` clearing.
- Use `playwright.config.ts` (`test:e2e:dev` webServer command) as the example:
  stale exported `HMR_PORT`/derived vars required explicit unsets to avoid
  collisions when only `PORT` changed.
- Naming follow-up: consider renaming `boundaryRoot` to `zoomBoundaryRoot` in
  note operation helpers and SDK adapter plumbing where the boundary is always
  zoom-specific.

## Test doc-id lifecycle hygiene (deferred)

- We currently mix two strategies in tests:
  random doc IDs (which can leave per-run collab data on disk) and repeatable
  doc IDs (which require explicit pre-test cleanup and add runtime cost).
- Plan a unified test doc-id lifecycle approach so data isolation and cleanup
  are deterministic without ad hoc per-suite behavior.

## Search architecture

- Search contract cleanup:
  - Confirmed: runtime `documentId` is host-owned state, injected by the
    environment, and should not be derived inside search logic. Source:
    `docs/outliner/note-ids.md`.
  - Confirmed: search scope is the whole current document. Source:
    `docs/outliner/search.md`.
  - Confirmed: internal note-link identity and route-ref syntax are structurally
    validated before navigation (`docId`/`noteId`, `/n/<docId>`,
    `/n/<docId>_<noteId>`). Sources: `docs/outliner/links.md`,
    `docs/outliner/note-ids.md`.
  - Design contract: routing, links, history, and document pickers produce a
    **requested document**. A requested document is not automatically the active
    document for search/editor/zoom.
  - Design contract: a single document-activation boundary is responsible for
    turning a requested document into an **active document** or an
    unavailable/invalid-document outcome.
  - Design contract: search consumes only the active document identity and its
    candidate snapshot. Search has no offline/availability awareness and should
    not branch on document availability signals.
  - Design contract: invalid document refs are handled before activation;
    valid-but-unavailable documents are handled by the activation boundary;
    neither case is represented as a search empty state.
  - Design contract: `No matches` / `No notes` mean search ran against an active
    document and found zero matching/all candidates. They must never mean
    offline, unavailable, invalid, or not-yet-activated.
  - Design contract: document-switching UI is a requester, not the authority on
    availability. Even if a picker lists only available docs later, deep links,
    pasted URLs, stale history, and internal links still resolve through the
    same activation boundary.
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

## Note-first SDK model (proposal)

- Make `Note` the core domain primitive across the SDK, not only the editor.
- Represent documents, user config entries, and content notes as note-like
  entities with different kinds.
- Keep SDK usage note-centric (`get`, `children`, traversal, cross-document
  search), while storage is adapter-based.
- Start with a simple in-memory adapter now; keep Lexical adapter as-is for
  editor-backed notes; allow future SQLite adapter without SDK usage changes.

### Agreed next steps

1. Define the generic SDK/core contract first, before moving route metadata:
   `Note` owns sync `text()`, sync `children()`, and throwing `as(kind)`.
2. Keep async behavior out of the raw `Note` handle for now. Cross-boundary
   traversal/search should live in async walker/finder helpers above the note
   API.
3. Treat adapter boundaries as an SDK implementation detail. Callers should
   traverse one note-first API without caring whether edges cross from metadata
   storage into editor-backed notes.
4. Keep document-specific note kinds on top of the generic note SDK/core rather
   than baking those mechanics into a document-only module.
5. Keep one `DocumentNote` kind. Its long-term meaning is the document node in
   the unified tree; `document.children()` is intended to expose document body
   root notes.
6. Defer non-current-document loading behavior instead of baking temporary
   unloaded/skip semantics into the public note API. If needed during
   transition, keep temporary limitations clearly internal to the SDK layer.

### Incremental implementation order

1. Extract generic note mechanics into SDK/core:
   base `Note` contract, typed kind narrowing via `as(kind)`, and generic
   adapter-facing handle construction.
2. Add document-specific kinds on top of that generic layer:
   `UserConfigNote`, `DocumentListNote`, `DocumentNote`, plus only the minimal
   convenience helpers that encode agreed invariants.
3. Introduce async walker/finder/query helpers intended for search and
   note-link completion so future cross-document traversal does not force raw
   recursive `children()` traversal into callers.
4. Rewire the hardcoded document list to use the new generic SDK/domain shape
   in-memory first.
5. Only then move route/document-picker code off the temporary hardcoded
   editor-SDK path.
6. After the new generic shape is in place, remove user-config responsibilities
   from `src/editor/outline/sdk/adapters/lexical.ts`.
7. Replace hardcoded metadata storage with persisted metadata storage
   (for example a dedicated meta Y-Sweet doc) behind the same SDK/domain
   boundary.

### Planned doc follow-ups

- `docs/outliner/concepts.md`: update once `Note` is promoted from outliner
  concept to the broader SDK/runtime primitive with explicit generic-vs-domain
  layering.
- `docs/architecture.md`: update once the repository/query layer and
  cross-adapter traversal contract are real.
- `docs/outliner/search.md`: update when search moves onto the async
  walker/finder contract.
- `docs/outliner/links.md`: update when note-link completion/search uses the
  same async traversal/query layer.

### Cautions and open questions

- Avoid forcing one flat note shape too early; keep a minimal `kind` +
  capabilities model first, and delay deep type hierarchy decisions.
- Define stable identity semantics now: note IDs scope, parent/child ownership,
  and cross-document references must stay backend-agnostic.
- Keep SDK domain API separate from adapter API so in-memory/Lexical/SQLite can
  swap without changing call sites.
- Decide whether cross-document link search is powered by loading document trees
  or by a separate index/search layer (prefer not to require loading all docs).
- Clarify loading model: what is lazy, what is preloaded, and which SDK calls
  are allowed to block/asynchronously hydrate data.
- Clarify mutation boundaries and consistency expectations across adapters
  (single-note writes vs transactional/multi-note updates).
- When document-scoped note APIs land, move `createNote`/`note` under a
  document-level note handle and remove user-config responsibilities from
  `src/editor/outline/sdk/adapters/lexical.ts` (compose adapters at SDK level).
- Before closing the current note-first SDK/doc-switcher workstream, delete the
  temporary hardcoded adapter file
  `src/editor/outline/sdk/adapters/hardcoded-user-config.ts`.
