# TODO

## About this file (scratchpad)

This file is an intentionally messy scratchpad for in-flight work, not a spec.

Rules:

- Mark completed items as `✅ Done` while a section is still active.
- Delete sections once fully done (no archive here).
- Move durable decisions/specs into the relevant doc under `docs/`, leaving a
  link behind.

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

## Document sharing

- Durable user-facing behavior lives in [docs/sharing.md](./sharing.md).
- Initial implementation can optimize for simplicity and may break compatibility
  during the dev phase if the design changes later.
- V1 UI/details:
  1. Add the sharing control to the left of the document search input.
  2. Default visible state text: `unshared`.
  3. While creating a link: `Generating`.
  4. After creation: `shared`.
  5. In the shared state, the visible status text is also the clickable link
     target and opens in a new window.
- V1 runtime/details:
  1. Use one active share URL per document at a time.
  2. Turning sharing off invalidates the active URL immediately.
  3. Turning sharing back on creates a different URL; the previous URL stays invalid.
  4. Keep normal document routing and document-list identity separate from the
     share URL in v1 unless implementation simplicity clearly favors a combined
     shape.
  5. Add direct routing unit coverage for share-path helpers once the routing
     API exists as a normal typed surface in `src/routing.ts`.
  6. Update the gateway/auth flow so valid share URLs can open without login,
     including Docker/Caddy and the corresponding prod e2e coverage.
- [Future] Reuse a share URL to add a document from another server into the
  local document list once the multi-server model is ready.

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
