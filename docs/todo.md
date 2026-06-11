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

## Editor feature module follow-ups

- [Future] Audit existing editor capabilities for migration into
  `src/client/editor/features/<feature>/` when they own a cohesive plugin plus
  related nodes, helpers, UI, and focused unit tests. Likely candidates include
  note links and search, but keep migrations incremental and behavior-neutral.

## Document access and sharing

- OAuth source-linking privilege follow-up: review whether linked source OAuth
  tokens should remain full account delegates, or require narrower RemDo scopes
  before remote servers can use document mutation APIs.
- Cross-server document-id collision guard follow-up: source-link bootstrap,
  projection merge, and import flows should detect a source document whose
  `docId` collides with an already-known local or linked-source document and
  reject or quarantine it before opening. This is a defensive guard around the
  documented base mechanism: every server must generate random document IDs with
  enough entropy for cross-server uniqueness.

## Offline and local persistence follow-ups

- Offline collaboration retry follow-up: reduce Y-Sweet document client token
  fetch and websocket reconnect noise when the app server or collaboration
  server is unavailable. The editor should keep showing a clear disconnected
  state, but repeated retries should avoid flooding the console and test guards.
- Unsynced local edits follow-up: expose a reliable "pending local changes"
  signal from the collaboration/local-persistence layer and show it in the UI.
  Destructive actions such as logout should warn before clearing local Yjs data
  when offline edits have not synced to the server.
- Local data wipe follow-up: add a separate "wipe this device" flow and design
  the related UX, including unsynced local edits, server-offline behavior, and
  open-tab IndexedDB cleanup blockers.
- Logout cleanup follow-up: keep server sign-out available even when local
  cleanup is incomplete, then design a user-visible warning/retry path for cases
  where IndexedDB enumeration or deletion cannot confirm that Y-Sweet offline
  data was removed. Until that UI exists, avoid silently claiming complete local
  cleanup in unsupported browser storage environments.

## User-data follow-ups

- User-data route follow-up: handle rejected `userData.documents().create()` calls
  from the document picker in `src/client/app/routes/DocumentRoute.tsx` so sync/write
  failures do not surface as unhandled promise rejections and the UI can
  recover cleanly. This is not required for sharing, but it is the same header
  area and async-command UX pattern as the sharing control.

## Production environment secrets follow-ups

- Reduce the number of required production secret env vars where possible.
  `AUTH_SECRET`, `ADMIN_SECRET`, `YSWEET_AUTH_KEY`, and `YSWEET_SERVER_TOKEN`
  are all currently operator-provided, which makes first-run setup easy to get
  wrong.
- Consider a production bootstrap/generation flow for secrets that can safely be
  created by RemDo itself. Keep generated values stable after first run, make
  rotation explicit, and do not hide secrets that operators must back up or move
  between hosts.
- Decide which secrets must remain distinct product concepts. For example,
  session/auth signing, admin provisioning, and Y-Sweet auth may deserve
  separate keys even if generation is automated.

## Document import / upload follow-ups

The "Upload" document-switcher action (`PendingDocumentImportPlugin` +
`pending-document-import.ts`).

- Silent failure: parseable-but-non-Lexical JSON (`{}`, `{"foo":1}`, `[]`)
  creates an empty doc with no alert in prod — `parseEditorState` routes the
  error to `onError`, which only `console.error`s in prod, so the plugin's
  `catch` never fires. Validate/reject at the upload boundary.
- Review/refactor the shipping commit for self-containment: it's spread across a
  module-level `Map` hand-off, a divergent copy of `TestBridgePlugin`'s load
  sequence, a borrowed test-only tag, and duplicate route error state. May need
  an architecture pass (shared hardened load primitive, intent via router/React
  state, import-then-commit so a failed import leaves no empty doc).

Remaining issues to fold in or fix directly:

- `await normalizeUpdate` / `await awaitSynced()` can hang forever: no
  timeout/noop guard, so a no-op normalize (clean backup) or a never-syncing
  provider leaves the import pending with no error.
- Effect re-run race: it depends on `awaitSynced`, whose identity changes per
  collab snapshot; a mid-import snapshot re-runs the effect and cancels the
  import after the file was already claimed, abandoning it silently.
- No `cancelled` recheck after `await loadUpdate` / before `awaitSynced` → a
  doc switch mid-import writes into the stale editor for the old `docId`.
- Stacked/mislabeled error alerts: a create failure during upload uses the
  "create" alert, and the two error states don't clear each other.
- File-dialog cancel leaves focus detached (no return to the trigger).
- Map leak: entries evict only on successful claim, so abandoned uploads retain
  the `File` for the session.

## Note-first SDK follow-ups

- App-resource SDK direction: model current-user app resources as projected
  note collections plus HTTP commands. Reads should come from the
  server-written current-user Yjs projection after bootstrap; writes should stay
  explicit HTTP commands. The SDK should mirror the conceptual resource tree,
  not raw route syntax.
- Current source-server slice status: projection-backed source-server SDK/UI
  reads are in place, and account linking remains an HTTP command.
- Current sharing/access slice status: document access reads are exposed as
  `document.access()` from the user-data projection, and `document.shareWith()`
  remains an HTTP command. The duplicate document-access `GET` read route is
  removed.
- Projection/note mapping review follow-up: review server-side projection
  builders plus SDK-level mapping and helper logic so projected app resources
  expose well-shaped note kinds instead of flattened DTO-shaped records. Start
  with document access: consider modeling access as a relationship note with
  `document()` and `grantee()` where the grantee is a public user/person note.
- Projection backing-store follow-up: after the sharing branch is merged,
  revisit whether app-resource projections should stay on Yjs. The likely
  target is a graph-shaped SDK backed by a simpler server-state graph/cache
  mechanism with live invalidation or patches, while keeping Yjs focused on
  collaborative document content. Do not choose or introduce that tool in this
  branch.
- Next note-resource cleanup:
  1. ✅ Done: introduce a generic collection-note role for ordered projected
     collections keyed by stable child note id.
  2. ✅ Done: make `documents()` and `sourceServers()` return typed collection
     facades instead of adding one SDK note kind per collection.
  3. Keep entity note kinds explicit where they carry entity-specific behavior:
     `DocumentNote` for documents and `SourceServerNote` for source servers.
  4. Collection note ids identify resource sections such as
     `user-documents` and `source-servers`; avoid a separate resource-key API
     unless a later slice needs it.
  5. Keep projected collection invariants consistent: child identity keyed by
     note id, sibling order owned by the collection, and browser state derived
     from projections rather than local command-result appends.
  6. After the collection role lands, use it as the default shape for future
     current-user resources before adding sharing/access-grant resources.
  7. ✅ Done: replace per-resource client arrays with a projection-backed
     collection adapter so note-sdk handles can read from Yjs containers while
     preserving the public note API and HTTP-only mutation boundary.
  8. ✅ Done: remove duplicate `GET` read routes once projection-backed UI and
     e2e coverage no longer depend on them, keeping `/api/current-user` as the
     bootstrap endpoint.
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
  4. Decide whether to suppress, classify, or otherwise avoid Node's
     `ExperimentalWarning` noise from Better Auth's SQLite path in dev/test
     commands.
  5. Classify or suppress the source-server Vite websocket proxy `EPIPE` noise
     seen during Docker linked-source E2E teardown; if it keeps recurring,
     consider avoiding Vite's `/d` websocket proxy in that source test server.
  6. Review current install-time warnings and classify each as `fix`, `track`,
     or `ignore`, especially:
     `glob@11.1.0`, `source-map@0.8.0-beta.0`, `sourcemap-codec@1.4.8`, and the
     `@typescript-eslint/*` peer mismatch against `typescript 6`.

## Later follow-ups

- Cross-server OAuth setup: add an operator-facing way to register or import
  RemDo OAuth clients between servers, add the source-server consent UI needed
  outside trusted dev clients, and extend two-server coverage once the
  operator client-registration flow is settled.
- Auth provisioning concepts: revisit user creation, dev fixture users, OAuth
  client creation restrictions, and server registration as separate flows with
  clearer boundaries.
- Cross-server terminology: standardize OAuth/linking language around home
  server and source server, and keep "remote" only for unrelated generic cases.
- Dev script ergonomics: update normal dev launchers to pre-kill conflicting
  RemDo services in their own `PORT_BASE` block before starting, instead of
  adding separate restart scripts. Keep the behavior port-scoped and avoid the
  shared Chrome DevTools endpoint.
- Server routes follow-up: review the API endpoint set before extracting route
  modules. Revisit endpoint names, grouping, browser-vs-server request
  boundaries, and whether any routes should move, merge, or be dropped. After
  the endpoint shape is settled, split `src/server/app.ts` route registration
  into small Hono route modules mounted with `app.route(...)`, keeping
  `createServerApp` focused on dependency setup and route overview. Consider a
  Hono `showRoutes()` dev helper or test for endpoint inventory after the route
  groups settle.
- Source layout follow-up: revisit browser/server/shared folder boundaries.
  Server code was added after the browser app shape was already established, so
  some document/current-user/domain concepts now sit beside browser runtime code.
  Clarify which modules are client-only, server-only, and shared domain code.
- Revisit client auth/bootstrap state caching once the auth and current-user
  model is more settled. The current lightweight bootstrap cache should
  eventually be keyed to the active Better Auth session, or invalidated by a
  clear shared auth-state boundary, so same-tab identity changes cannot reuse
  stale home/user-data document ids.
