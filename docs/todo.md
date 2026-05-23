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
- [Future] Define shared search/link-query matching semantics before normalizing
  result labels: whitespace-insensitive lookup (trim/collapse between words),
  fuzzy matching, and shared ranking/disambiguation rules.

## Document access and sharing

- Durable document access behavior lives in [docs/access-model.md](./access-model.md).
- Initial implementation can optimize for simplicity and may break compatibility
  during the dev phase if the design changes later.
- Design inputs:
  1. Durable project constraints live in [docs/principles.md](./principles.md).
  2. Evaluate auth, sync, storage, and hosting choices against those principles.
  3. Keep project assumptions separate from replaceable tooling choices.
- Planning workflow before implementation:
  1. ✅ Done: list user-visible sharing/access functionality that is incomplete,
     including partially done behavior.
  2. ✅ Done: choose the user-visible functionality that belongs in this branch.
  3. ✅ Done: re-review the chosen scope against docs and code, then recommend
     technical prerequisites, expensive-to-change design decisions, and items to
     keep out of this branch.
  4. ✅ Done: finalize the product scope; keep DB unification as an open
     implementation decision.
  5. ✅ Done: draft the resulting plan in `docs/access-model.md` and keep
     fast-moving notes in this section.
  6. Next: consult the proposed access-control design materials, record the
     sources that influenced decisions, and add acceptance tests.
  7. Pending: implement the agreed scope.
  8. Pending: ship this branch with deferred items left explicit.
- Settled branch decisions:
  1. Target cross-server request-to-access sharing, not anonymous or bearer-link
     sharing.
  2. The normal document URL is only a document locator. Possessing it must not
     grant access.
  3. External human channels may identify the requester; approval still binds to
     a credential for continuity.
  4. Only `shareable` documents accept access requests; `private` rejects or
     auto-revokes them before owner review.
  5. Access mode is owner-controlled, not derived from active grants.
- Branch intention: cross-server request-to-access sharing:
  1. Alice owns `doc123` on server A.
  2. Alice changes `doc123` access mode to `shareable`, copies its normal URL,
     and sends it outside RemDo.
  3. Bob pastes that URL into server B from a new import/request-access UI.
  4. Server B sends an access request to server A.
  5. Alice sees the pending request in the document properties UI on server A.
  6. Alice can approve the request. Deny/reject can ship later.
  7. Server A creates a grant bound to the approved request credential.
  8. Bob sees the remote document in server B and can open/edit it.
  9. Server A remains the document host and token issuer.
- Deferred access cases:
  1. Anonymous access.
  2. Bearer/link-based access.
  3. Public documents.
  4. Link revocation/regeneration/invalid-link UX.
  5. Local-only no-login mode.
- Open implementation decision: unify Better Auth's `better-sqlite3` path with
  the registry's `node:sqlite` path before adding request/grant tables, or defer.

## Offline and local persistence follow-ups

- Offline collaboration retry follow-up: reduce token-fetch and websocket
  reconnect noise when the app server or collaboration server is unavailable.
  The editor should keep showing a clear disconnected state, but repeated
  retries should avoid flooding the console and test guards.
- Unsynced local edits follow-up: expose a reliable "pending local changes"
  signal from the collaboration/local-persistence layer and show it in the UI.
  Destructive actions such as logout should warn before clearing local Yjs data
  when offline edits have not synced to the server.
- Local data wipe follow-up: add a separate "wipe this device" flow and design
  the related UX, including unsynced local edits, server-offline behavior, and
  open-tab IndexedDB cleanup blockers.

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

## User-data follow-ups

- User-data route follow-up: handle rejected `userData.documents().create()` calls
  from the document picker in `src/routes/DocumentRoute.tsx` so sync/write
  failures do not surface as unhandled promise rejections and the UI can
  recover cleanly. This is not required for sharing, but it is the same header
  area and async-command UX pattern as the sharing control.

## Note-first SDK follow-ups

- Generic note handles, document-specific note kinds, and persisted user-data
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
  5. Redesign projected user-data note collections around note-model
     invariants: child identity keyed by note id, sibling order owned by the
     parent, and browser state derived from the projection rather than local
     command-result appends. Apply this to documents as one projected note
     collection kind before adding more projected app-state sections.
  6. Review the remaining top-level API naming after the note-owned
     `create(...)` refactor, especially `createLexicalEditorNotes` and
     `place(...)`.
  7. Update the durable docs once the traversal/query contract stabilizes:
     `docs/outliner/concepts.md`, `docs/architecture.md`,
     `docs/outliner/search.md`, and `docs/outliner/links.md`.

## Test harness follow-ups

- Reduce repeated full-outline literals in tests by adding a generic helper
  that patches a previously-read outline by `noteId`, then still asserts with
  `toMatchOutline`.
- Prefer this over property-specific helpers like `setFolded(...)`: tests stay
  focused on the changed notes while still verifying that untouched notes remain
  unchanged.
- Revisit `meta(... viewProps ...)` setup, especially zoom-related state.
  Prefer simple explicit test actions (for example dispatching the real zoom
  command, or at most a thin helper around it) over smart harness metadata that
  adds API surface, hides behavior setup, and cannot be changed mid-test.

## Warning and drift detection follow-ups

- Pin / drift decisions:
  1. Decide whether to replace `pnpm dlx esbuild` in `docker/Dockerfile` with a
     lockfile-backed tool path or at least an exact version; Docker currently
     pulls a different `esbuild` than the workspace.
  2. Decide whether `docker/Dockerfile` should keep `y-sweet@^0.9.1` or pin an
     exact version for deterministic image builds.
  3. Decide whether to update the pinned `packageManager` version in
     `package.json` or intentionally keep the current pnpm line and suppress the
     resulting upgrade notices elsewhere.

- Add more deterministic detection:
  1. Extend `tools/check-pnpm-policy.ts` to flag floating install surfaces such
     as committed `pnpm dlx` usage and ranged `npm install -g` in Dockerfiles or
     scripts.
  2. Add a plain `pnpm run build` validation surface to CI and/or the dependency
     refresh flow so build warnings are reviewed explicitly instead of only via
     Docker logs.
  3. Revisit pnpm build-script policy: consider moving from
     `onlyBuiltDependencies` to `allowBuilds` and enabling
     `strictDepBuilds: true`.

- Warning policy / classify-or-suppress:
  1. Decide how to handle the Vite large-chunk warning: real size budget,
     accepted warning, or follow-up chunking work.
  2. Decide how to handle the `snapshot.mjs` esbuild size warning in Docker:
     explicit budget, suppression, or accepted noise.
  3. Decide whether to suppress or just classify the `NO_COLOR` / `FORCE_COLOR`
     warnings seen during Docker Playwright runs.
  4. Review current install-time warnings and classify each as `fix`, `track`,
     or `ignore`, especially:
     `glob@11.1.0`, `source-map@0.8.0-beta.0`, `sourcemap-codec@1.4.8`, and the
     `@typescript-eslint/*` peer mismatch against `typescript 6`.

## Later follow-ups

- Source layout follow-up: revisit browser/server/shared folder boundaries.
  Server code was added after the browser app shape was already established, so
  some document/current-user/domain concepts now sit beside browser runtime code.
  Clarify which modules are client-only, server-only, and shared domain code.
- Revisit client auth/bootstrap state caching once the auth and current-user
  model is more settled. The current lightweight bootstrap cache should
  eventually be keyed to the active Better Auth session, or invalidated by a
  clear shared auth-state boundary, so same-tab identity changes cannot reuse
  stale home/user-data document ids.
