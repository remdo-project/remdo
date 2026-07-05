# TODO

## About this file (scratchpad)

This file is an intentionally messy scratchpad for current and near-term work —
things we plan to get back to soon. Entries are short reminders, not agreed
decisions or write-ups. Keep each to a line or two; being vague is fine if it
keeps it short. Don't add findings, measurements, or rationale here — that
belongs in the work itself when it happens.

A long-horizon future direction (deferred indefinitely, not near-term) does not
belong here — it lives as a short trigger in the owning doc's `Future` section,
rediscovered when that area is worked on again.

Rules:

- Mark completed items as `✅ Done` while a section is still active.
- Delete sections once fully done (no archive here).
- Move durable decisions/specs into the relevant doc under `docs/`, leaving a
  link behind.

## Scratchpad maintenance

- Clear out drifted long-horizon items: this file has accumulated entries that
  are not near-term (e.g. `## Later follow-ups`, scattered `[Future]` entries);
  prune them or relocate to a spec `Future` section per the scope above.

## Search architecture

- Add a document-level SDK visitor/walker API and use it as the shared
  traversal primitive for search snapshot building and note-link candidate
  collection. Keep search/query semantics and note-link ranking/disambiguation
  outside the SDK.
- Make lexical note lookup indexed / amortized `O(1)` and move SDK handle reads
  (`textOf`, `childrenOf`, `hasNote`, `note(...)`) onto that path so search and
  other SDK consumers do not pay scan-based lookup costs per visited note.
- Search now reads the editor through the SDK (`EditorNote` handles, including
  `parent()`) via a `searchNotes` accessor on the editor view provider — no
  materialized snapshot. Remaining ad-hoc projections (selection, schema-ready)
  could converge onto the same accessor pattern over time.
- Search candidate reads are O(n) per keystroke (live SDK walks; `parent()` and
  by-id reads scan the outline). Accepted; collapses onto the indexed-lookup work
  above with no change to the search-side API (the accessor reads stay the same).
- Deferred: search results do not reactively refresh on concurrent collab edits
  while the panel is open (the editor is hidden during search, so local edits
  can't desync; only remote edits can). The accessor re-registers per local edit
  ("pretend reactivity"); a reactive SDK would extend that to remote edits without
  changing consumers.
- [Future] Unify candidate discovery between search and the link picker: query
  matching is now shared (`#client/search/query-match`), but the link picker
  still has its own traversal/index pipeline distinct from the search SDK walk.

## Editor feature module follow-ups

- [Future] Audit existing editor capabilities for migration into
  `src/client/editor/features/<feature>/` when they own a cohesive plugin plus
  related nodes, helpers, UI, and focused unit tests. Likely candidates include
  note links and search, but keep migrations incremental and behavior-neutral.
- Hoist the shared note-body primitives out of `features/note-body/` into the
  shared layer: several `outline/` and `runtime/` modules import `isBodyWrapper`,
  `$resolveNoteForSelectionPoint`, and body-selection helpers from
  `note-body-node`/`note-body-ops`, violating the one-way feature→shared rule in
  `docs/contributing.md#editor-feature-modules`. Move the cross-cutting body
  primitives (the note-kind predicates and selection resolvers many shared
  modules consume) to `outline/`, leaving feature-specific logic behind.
- Editor-popup UX redesign (spec: `popups.md`/`dates.md`/`links.md`/`menu.md`) —
  remaining follow-ups (spec ahead of code on these details):
  - Dedup the duplicated portal/anchor/dismissal plumbing between `NoteMenuPlugin`
    and the popup engine (they still each implement it).
  - Confirm/adjust the menu's per-widget key details against `menu.md` (Tab
    closes+returns; F/Z/digit accelerators vs. the menu pattern's optional
    type-ahead) — the menu was folded into the registry but its keymap was not
    reworked in this pass.

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

## Admin role follow-ups

Admin role + secret-gated enrollment foundation is built; still to come:

- Reconsider `/api/config` vs `/api/health` — maybe one `/api/status` covers both.
- Admin panel: **promoting an existing user to admin** and per-admin revocation
  — the only way today to gain admin is registering a new account via the
  secret.
- Toolbar **Admin** link for signed-in admins (`App.tsx`). Pure-additive UI
  against the `role`-on-bootstrap that already exists, with no new infra.
- Runtime public-policy toggle (replace `ALLOW_SIGNUP` env with admin-managed,
  DB-backed state). Needs auth hot-swap (rebuild `betterAuth` to flip the
  construction-time `disableSignUp`).

## Source-linking follow-ups

Admin-managed source linking is built: home admins add + register sources from
the `/admin` panel (register-home ceremony → persisted credentials →
swappable-auth activation); the admin-managed DB model replaced the
`LINKABLE_REMDO_SERVERS_JSON` env config; home admin actions gate on the admin
role; the source accepts registration only from an authenticated account while
public (`ALLOW_SIGNUP`-backed). Two-server Docker E2E green.

Deferred hardening:

- Audit logging + rate limiting on self-enrollment and public-policy changes.
- `ADMIN_SECRET` rotation lifecycle: define whether rotating affects existing
  admins or only future enrollment.
- Split signup policy from source client-registration policy (separate runtime
  settings + a "public source" preset) once the source-linking work lands.
- Source-side `clientPrivileges` to restrict raw OAuth client creation — a
  separate boundary from the home-side role gate.
- Reject non-loopback http sources in `deriveSourceServer` so `normalizeSourceIssuer`
  (a mirror of Better Auth's `validateIssuerUrl`) can be deleted. Blocked on the
  Docker E2E, whose source is `http://<host-IP>` (rootless Docker can't reach a
  loopback source) — the real work is making that source loopback-reachable.
- Rate-limit `POST /api/link/register-home`: it calls `auth.api.registerOAuthClient`
  server-side, which bypasses Better Auth's HTTP-layer `rateLimit.register`, so a
  signed-in source user can register unbounded OAuth clients. Enforce a limit in
  the RemDo route (the `oauthProvider` `rateLimit.register` config only guards the
  raw HTTP endpoint).
- `register-home` accepts any bare-origin `home`, so a signed-in source user who
  clicks Authorize on a phished `/oauth/register-home?home=<evil>` registers a
  client with an attacker `redirect_uri` and is handed the one-time code. Bind
  registration to known/expected homes (or require an explicit source-side
  confirmation of the home origin) rather than trusting the query param.
- `claim-registration` authorizes on the one-time code alone and returns the
  client secret; the code rides in the home admin's address bar (`/admin?code=…`)
  until an effect strips it. Consider binding the claim to the issuing handle/home
  origin and moving the code out of the URL so a leaked URL can't claim the secret.
- `POST /source-servers/:id/claim` burns the source's one-time code (via
  `claim-registration`) before `setSourceServerCredentials` persists locally; a
  persist failure strands the flow (code gone, handle kept) and needs a full
  re-register. Make the claim idempotent or persist-before-consume.
- Re-registering a source overwrites its stored client id/secret but leaves users'
  existing Better Auth account rows for that `providerId`, so `listLinkedRemdoServerIds`
  still shows them Linked while their refresh tokens (issued to the old client)
  fail. Invalidate local account links for a source when its credentials change,
  or otherwise force affected users through relinking.
- Multi-admin: admin-grants-admin UI, per-admin revocation; ban/impersonate from
  the Better Auth admin plugin.
- Tradeoff (standing): the admin secret is a permanent gate with no per-admin
  revocation; accepted for single-operator self-host, revisit for public
  multi-tenant.

## Offline and local persistence follow-ups

- Offline route should redirect away once back online: `/offline` is reachable
  on a transient failure but stays put after connectivity returns. Watch
  `navigator.onLine`/the online event (or re-resolve the session) and redirect to
  the intended destination.
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

## Admin enrollment follow-ups

- Coverage gap: the enroll flow's `resetUserData()` (so a signed-in non-admin who
  enrolls a NEW admin doesn't keep the prior user's live runtime) has no
  regression test — the loader-only unit spec doesn't render the form, and a
  component render hit shared-jsdom editor-mount friction. Add a dev e2e for
  "signed-in non-admin enrolls → sees the new admin's data, not the prior user's"
  (needs a non-admin session in the e2e setup, which today enrolls an admin).

## User-data follow-ups

- User-data route follow-up: handle rejected `userData.documents().create()` calls
  from the document picker in `src/client/app/routes/DocumentRoute.tsx` so sync/write
  failures do not surface as unhandled promise rejections and the UI can
  recover cleanly. This is not required for sharing, but it is the same header
  area and async-command UX pattern as the sharing control.

## One-service-per-container split

- Docker treats running the client, API, and Y-Sweet collaboration server in a
  single image as a multiple-services-per-container anti-pattern, and that shape
  is what forces the multi-port machinery. Splitting into separate containers
  (compose / managed multi-service) would let each service bind a fixed port and
  delete most of the config module (see [docs/config.md](./config.md)), but it is
  a larger deployment/Dockerfile/Caddy change.

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

## Run modes follow-ups

- Backup workflow for hosted prod (managed cloud) is undefined —
  `docs/run-modes.md` specifies only the backup/export mode surface; define the
  hosted-prod workflow.

## Client-side perf follow-ups

- Typing-latency optimizations (moved from
  `docs/performance/client-side-perf-tests.md`): gate `SchemaValidationPlugin`
  validation and `RootSchemaPlugin` repair scans on dirty-set contents so
  leaf-only typing updates skip them; skip redundant structural-overlay and
  outline-selection store writes in `SelectionPlugin` when nothing changed.

## Test harness follow-ups

- Improve expected-console-issue ergonomics (`assertions/console.ts`): make
  allowlisting a genuinely-expected error (e.g. a benign 401 probe) a cheap
  one-liner-with-reason at the assertion site, so silencing it in code isn't the
  easier path. Keep the fail-closed gate; reword "failure" for expected issues.
- Redesign `toMatchOutline` note content expectations from flattened text into
  node-level content. Target shape:
  `{ noteId: 'note1', content: [{ text: 'before ' }, { date: '2026-06-10' }, { text: ' after' }] }`.
  Until then, flattened outline text stays readable/user-facing, while
  node-specific identity such as date ISO values stays covered by focused
  feature tests.
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
- Collab full-suite flakiness on high-core machines (CI unaffected): vitest
  forks scale to cores but the 5s timeout and single collab server don't. Cap
  `poolOptions.forks.maxForks` (~4 / `'50%'`) and raise the timeout on the
  subprocess-spawning specs; verify with `test:collab:repeat`. (Distinct from
  the e2e readiness flake below.)
- e2e `TestBridgePlugin: collaboration readiness timed out` flake (CI, ~1/99,
  different test each time; seen on `editor/deletion.spec.ts` `editor.load(...)`).
  Preceded by a vite `/d` ws-proxy `ECONNRESET` — a dropped collab websocket
  blows the 2000ms `waitForCollaborationReady` budget in `TestBridgePlugin.tsx`.
  Repro odds: `pnpm run test:e2e:repeat`. Candidate fixes: retry/reconnect around
  `collab.awaitSynced`, or raise/derive the readiness budget. Don't mask it by
  blanket-bumping the timeout without confirming the ws drop is the cause.

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
  3. Add `TODO:`/`FIXME:` scanning to the dependency-refresh skill: surface
     dependency-related markers, run each one's stated probe, and drop the
     workaround (and marker) when it passes — so workarounds self-heal instead of
     accumulating. See `docs/contributing.md#code-comments`. While here, revisit
     the marker convention itself for ways to make it more reliable/self-healing
     (e.g. a more scannable shape for trackable workarounds, lint-enforced
     expiry, reconciling existing markers) — open-ended, not yet scoped.

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

## Dev environment: inotify watch exhaustion

`data/collab/` grows unbounded (one dir per ephemeral dev/test doc), and editors
watch it, exhausting `fs.inotify.max_user_watches` across worktrees so the Vite
e2e dev server can't start (`ENOSPC`). Did a one-off prune of stale entries.
Durable fixes:

- Add `files.watcherExclude` for `**/data/**` and `**/node_modules/**` (editor
  config; `.gitignore` is not honored by watchers).
- Cap/rotate the `data/collab/` store, or have the test harness clean its collab
  docs after runs, so it can't grow unbounded again.

## remdo-feature-flow follow-ups

- Clean up stale prunable worktree `remdo-7000-wt` if abandoned (not mine).

## Note body follow-ups

The feature is built (see `docs/outliner/body.md`). Remaining follow-ups:

- Undo does not restore selection under collaboration (Lexical's `@lexical/yjs`
  V2 history only persists structure, not the caret). This is global, not
  body-specific — RemDo's undo tests assert structure only. Decide if restoring
  selection on undo is worth wiring the Yjs `UndoManager` StackItem `meta`.
- Pasting a pending structural cut into a *non-cut* note's body is currently a
  no-op (cut stays pending) since a body can't hold notes. Pin the final
  semantics (no-op vs. move-as-flattened-text) in the cut/paste redesign;
  `NoteIdPlugin` `SELECTION_INSERT_CLIPBOARD_NODES_COMMAND` body branch.

## remdo-docs-align follow-ups

- Consolidate doc responsibility fully into docs-align: refine's doc rung
  invokes the whole pipeline (diff scope) instead of stages 3–4, and
  `remdo-simplify` drops its doc lens to become the code/test finder only —
  removes the last double route to doc checking.
- Consider borrowing from the Upkeep skill (wei18/Upkeep): its structured
  finding schema and parallel specialist-reviewer layout could speed the align
  pass on large scopes.
- Consider borrowing superpowers `writing-skills` pressure-testing (adversarial
  subagent trials) as an extra check for skill-file prose.
- Consider publishing the skill to the open Agent Skills registry once it is
  polished and battle-tested in this project (would need a bundled starter
  rules-doc template).
- Unresolved: negation clauses that restate an adjacent rule (the deps-refresh
  "not human judgement" / "never lands on `main`" specimens) — the advocate
  declined them in every experiment run and a negation-priority prompt line
  failed validation; re-test at narrow scope, re-judge the specimens, or accept
  the advocate's implicit keep.

## Skill architecture follow-ups

- Define shared cross-skill contracts once (AGENTS.md or contributing.md) and
  have each skill state only its delta: one stop/escalation taxonomy (today
  six names: ESCALATE/Blocker/Stuck/stop/dead-end/callout), one
  mutation-permission vocabulary (today five variants), one report skeleton,
  and a one-line verification-ownership map (feature-flow proves spec
  behavior; refine owns quality backstops; sync the post-merge check;
  deps-refresh its matrix). Reconcile with AGENTS.md's declare-scope-in-situ
  rule via shared vocabulary + per-skill delta.

## remdo-refine follow-ups

- Add more external review tools/skills/programs worth considering in the refine
  ladder beyond `codex review` (e.g. other reviewers or static analyzers);
  evaluate each for fit and independence before adding a rung.

## Later follow-ups

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
