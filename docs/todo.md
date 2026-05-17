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

## Document sharing

- Durable document access behavior lives in [docs/access-model.md](./access-model.md).
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

## Architecture decision work

- Durable project constraints now live in [docs/principles.md](./principles.md).
- Evaluate auth, sync, storage, and hosting choices against those principles.
- Keep project assumptions separate from replaceable tooling choices.
- Auth/storage follow-up: Better Auth currently uses `better-sqlite3` while the
  document registry still uses `node:sqlite`. Unify those server-side SQLite
  paths once the broader DB layer is revisited.
- Auth/dev follow-up: keep Better Auth enabled in normal local dev because it
  now participates in app behavior (session resolution, admin provisioning/login
  flow, token issuance), not just deployment gateway protection. Aim for
  unification and simplicity across dev and server modes; if local dev friction
  becomes a problem later, prefer a clearly separate convenience mode over
  reintroducing a silent auth bypass into the default dev path.
- Config contract follow-up: clarify whether `config.env` values are the
  authoritative app/stack runtime contract or only defaults that individual
  layers may override. Current env values can be derived or changed through
  shell defaults, Docker scripts, TS config loading, constructor options, and
  tests, which makes it unclear when `.env` is globally respected versus when a
  local code path may substitute different behavior. This is especially risky
  for auth-sensitive values such as signup policy, canonical auth URL, secrets,
  and server database paths. Consider refactoring config into a more declarative
  contract that names type, visibility, default source, derivation, validation
  phase, and requiredness so tests can cover a small set of named policies
  instead of encoding the contract through ad hoc loader scenarios.
- Docker prod E2E env follow-up: revisit whether Docker prod E2E should keep
  its separate container-level env handling or share more of the local env
  derivation path.
- Default document naming follow-up: rethink the remaining `default` document
  terminology after profile-owned home documents. The old name mixed app
  startup, route fallback, `/n/main`-style URL fixtures, tests, tooling, and
  configured collab document behavior; revisit the remaining uses, drop the
  generic default/main naming where it no longer describes the role, and give
  each context a purpose-specific name.
- Home route alias follow-up: add an explicit home URL alias that resolves to
  the authenticated user's current profile home document. Keep this separate
  from legacy `/n/main`; that path should remain a literal document id until
  the naming cleanup above removes or renames leftover `main` fixtures.
- Source layout follow-up: revisit browser/server/shared folder boundaries.
  Server code was added after the browser app shape was already established, so
  some document/profile/domain concepts now sit beside browser runtime code.
  Clarify which modules are client-only, server-only, and shared domain code.
- ✅ Done E2E profile path follow-up: remove the special injected `usercfg`/config-doc
  path from E2E helpers. Browser E2E should authenticate and load profile/home
  resources through the same `/api/profile` path as normal users, with test
  isolation coming from users/data setup rather than a client-side config-doc
  override.
- Routing return-path follow-up: centralize post-auth return-path handling.
  Replace ad hoc `next` parsing and path safety checks with one tested helper
  that defines which app-local redirects are allowed.
- Offline auth/product follow-up: define the offline auth states explicitly.
  Expected shape: unauthenticated offline users see a fallback message,
  remembered authenticated sessions may open cached/local routes without
  re-authenticating, and logout clears remembered auth plus local user data.
- Dev API DX follow-up: evaluate mounting the Hono RemDo API inside the Vite dev
  server for `/api/*` instead of proxying to a separate `dev:api` process. Goal:
  same-origin API behavior in local dev with fewer stale route/process issues,
  while keeping production/Docker gateway behavior separately covered.
- Y-Sweet token enforcement follow-up: run the collaboration server with
  Y-Sweet auth enabled in local, test, Docker, and production-like run modes so
  RemDo-issued `full` and `read-only` tokens are enforced by the sync server,
  not just by the RemDo API path.
- User-config security regression guards: add Docker prod E2E coverage that
  proves user-config projection docs are persisted through the normal Y-Sweet
  store, issued as read-only, and cannot be modified through direct sync-token
  access. Also cover the allowed path: server-validated document creation
  updates SQL first and then refreshes the user-config projection. These tests
  should lock the access boundary against future refactors.
- User/profile/config/document-list model follow-up: redesign the hierarchy and
  naming so the shape is obvious to read and each layer has a clear role. In
  particular, clarify where user profile entries, app config, the home document,
  and the document list live, and make sure access to those entries goes
  through the note-facing API rather than bypassing it with ad hoc profile
  structures.
- Read-only Yjs proxy writer follow-up: replace the current temporary
  `Y.Doc`/encoded-update projection refresh path with an API-server Yjs client
  that connects to the Y-Sweet proxy document it owns. Browsers should keep
  read-only tokens for those proxy docs, while mutations such as creating a
  document continue to go through explicit API commands that validate and update
  SQL first.
- Projection writer lifecycle follow-up: define how server-side proxy writer
  connections are managed before introducing the live writer path. Decide
  whether writers connect per update or are cached, what "flushed before API
  response" means, and how idle connections are cleaned up in local, Docker,
  and future cloud run modes.

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

- Revisit client auth/profile state caching once the auth and profile model is
  more settled. The current lightweight profile cache should eventually be
  keyed to the active Better Auth session, or invalidated by a clear shared
  auth-state boundary, so same-tab identity changes cannot reuse stale
  home/config document ids.
