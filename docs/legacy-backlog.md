# Legacy backlog

This file retains unresolved work recorded before
[`docs/todo.md`](todo.md) became RemDo's authoritative TODO and sole intake. It
is closed to new entries; record new temporary work in `docs/todo.md`.

Existing entries are [informative](documentation.md#contracts) and remain
tracked until they are completed and deleted or moved to `docs/todo.md` or an
owning spec's `Future` section. They remain part of duplicate and
review-suppression checks while they are here.

Rules:

- Mark completed items as `✅ Done` while a section is still active.
- Delete sections once fully done.
- Move durable decisions and requirements into their owner under `docs/`.

## Scratchpad maintenance

- Clear out drifted long-horizon items: this file has accumulated entries that
  are not near-term (e.g. `## Later follow-ups`, scattered `[Future]` entries);
  prune them or relocate to a spec `Future` section per the scope above.

- Portal-root tracking (`root.closest('.editor-container')` seeded in state +
  updated from `registerRootListener`) is hand-rolled at three call sites:
  `NoteControlsPlugin`, `NoteMenuPlugin`, and `EditorRuntime` for the mobile
  toolbar. Extract a shared `usePortalRoot(editor)` hook and migrate all three —
  net deletion, but a cross-component refactor of otherwise-untouched code.

- Mobile toolbar disabled buttons use `aria-disabled` (not native `disabled`),
  so a keyboard/AT user can focus a greyed action and it announces as disabled,
  but Enter/Space no-ops (an inert focus stop). This is the intended WAI-ARIA
  trade (announce-vs-skip) chosen for the a11y benefit; the toolbar is touch-only
  (coarse pointer), so physical-keyboard tabbing is rare. Revisit only if the
  inert focus stop proves confusing for switch/AT users (e.g. add a spoken hint,
  or reconsider hide-vs-disable for scroll actions).

- Mobile toolbar edge fade seeds from the ResizeObserver's first (async)
  callback, so an overflowing row can paint one frame without the end fade (a
  static-looking edge) before it appears — a sub-frame cosmetic flash. Accepted:
  a synchronous pre-paint seed trips the `react/set-state-in-effect` lint, and
  the flash is negligible. Revisit if it's ever visible.

## SDK and query architecture

- [Future] Unify candidate discovery between search and the link picker only if
  their real query needs converge. Query matching is shared
  (`#client/search/query-match`), but the link picker still has its own
  traversal/index pipeline distinct from document search.

## Editor popup follow-ups

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
  reject or quarantine it before opening.

## Admin role follow-ups

- Reconsider `/api/config` vs `/api/health` — maybe one `/api/status` covers both.
- Admin panel: **promoting an existing user to admin** and per-admin revocation
  — the only way today to gain admin is registering a new account via the secret.
- Ban/impersonate from the Better Auth admin plugin.
- Runtime public-policy toggle (replace `ALLOW_SIGNUP` env with admin-managed,
  DB-backed state) and UI. Swappable auth is in place; the toggle still needs implementation.

## Source-linking follow-ups

Historical reference for the [post-migration redesign](todo.md#cross-server-linking-redesign); these
implementation-specific ideas are not migration requirements.

- Public-source registration abuse: the home self-registers unauthenticatedly,
  so the deleted per-account (userId-keyed) register limit can't be ported —
  there is no session principal. The only bound left is Better Auth's IP-keyed
  `oauthProvider.rateLimit.register` (5/60s), which mis-keys for this case
  (NAT'd homes share a bucket; an attacker rotates IPs to evade). Needs a
  registration-abuse control fit for unauthenticated registration (e.g. a global
  cap, trusted-proxy IP config, or proof-of-work), designed with the public-source
  policy split above.
- No user-facing "unlink / remove a source" path exists after the URL-first
  redesign: URL-first linking added a link route but the old admin remove route
  was deleted, so `removeSourceServer` + the `rebuild()`-on-removal behavior lost
  their only caller (removed as dead code). Re-add an unlink capability (a
  user-scoped route that removes the account link, and — if a source ends up with
  no linked users — optionally drops the cached source client), restoring
  `removeSourceServer` + its coverage against a real caller at that point.
- Unreachable linked source floods the console + is silent to the user. When a
  linked source is down or its OAuth token can't refresh,
  `/source-servers/:id/current-user` fails and the client's `DelayedRetry`
  (`stored-user-data.ts`) re-fetches forever at a fixed interval with no backoff,
  cap, or give-up — each attempt logs. Add backoff + a bounded retry, and expose
  a user-visible per-source status ("source offline / re-link needed") instead
  of only console errors. Related to the offline-collab retry item below.
  - Also: the route returns 403 for "linked but no usable token" (source
    unreachable / token unrefreshable), conflating it with "not linked / no
    access". A source-unreachable/upstream failure is really a gateway error
    (502/504), which would also let the client distinguish "offline, keep the
    link" from a real "forbidden". Worth splitting when the status UI lands.

## Offline and local persistence follow-ups

- Access-denied vs connection copy: distinguish collaboration authorization
  denial from an unreachable server when a user opens an inaccessible document
  directly.
- Connectivity recovery feedback: visibly confirm when synchronization resumes;
  coordinate the copy with the pending-local-changes signal below so it does not
  claim that edits are server-synced before the collaboration layer confirms it.
- Offline collaboration retry follow-up: keep live-session reconnect retries
  from flooding diagnostics while preserving a clear disconnected state.
- Local data wipe follow-up: add a separate "wipe this device" flow and design
  the related UX, including unsynced local edits and server-offline behavior.
  (The open-tab IndexedDB cleanup blocker is resolved: the provider closes its
  connection on teardown, and a cross-tab sign-out tears peers down.)

## Document import / upload follow-ups

The "Upload" document-switcher action (`PendingDocumentImportPlugin` + `pending-document-import.ts`).

- Silent failure: parseable-but-non-Lexical JSON (`{}`, `{"foo":1}`, `[]`)
  creates an empty doc with no alert in prod — `parseEditorState` routes the
  error to `onError`, which only `console.error`s in prod, so the plugin's
  `catch` never fires. Validate/reject at the upload boundary.
- Review/refactor the shipping commit for self-containment: it's spread across a
  module-level `Map` hand-off, a divergent copy of `TestBridgePlugin`'s load
  sequence, a borrowed test-only tag, and duplicate route error state. May need
  an architecture pass (shared hardened load primitive, intent via router/React
  state, import-then-commit so a failed import leaves no empty doc).
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

## Home and location-header follow-ups

Tracks remaining gaps between [Home](specs/outliner/home.md) and the [location header](specs/outliner/location-header.md) as specified and what
ships.

- The document-source combobox in `DocumentToolbar.tsx` still lists documents for
  switching; Home owns browsing and New/Upload. Remove the picker once Home fully
  covers switching; the intervening state (both present) is the recorded interim.
  While both exist they duplicate the per-source document list; removing the
  picker resolves the duplication, so leave it rather than extracting a shared
  helper now. Re-selecting the already-open document while zoomed now matches
  Home: both clear zoom to the document root. Retirement is its own PR: delete
  the picker and the `documentControl` slot from `ZoomBreadcrumbs` (the doc name
  stays a crumb), delete its specs
  (`document-switcher.spec.ts`, the picker cases in
  `document-toolbar.spec.tsx`/`document-route.spec.tsx`).

The location header and document actions are specified but not yet built; the
entries below track implementation gaps against their rules.

- No document-root location header is rendered; the document name remains in
  the breadcrumb picker, so rename is reachable only from a Home row menu.
- Menu buttons do not share the [persistent active target](specs/outliner/menu.md#entry) across the document
  header, Home rows, and editor notes.
- No zoomed-note location header is rendered: the zoom root remains the
  editable top outline `ListItemNode`.
- The subtree-zoom root is an editable outline `ListItemNode`, and the
  location-header restrictions are enforced
  through per-command zoom-root special-casing in `InsertionPlugin`,
  `DeletionPlugin`, `FoldingPlugin`, `IndentationPlugin`, `ReorderingPlugin`, and
  the note menu until the separate header is implemented.
- Zoomed-note heading semantics: the header carries the view's heading semantics;
  the editable content and the heading role must stay on separate elements (a
  `textbox` role masks an inner heading from assistive tech). Close with the
  location-header work.

## Note-first SDK follow-ups

The projection-backed app-resource implementation is retired. Its historical
design is available in Git; [SDK consumer work](todo.md#sdk) owns future app-resource decisions
against the [document registry](architecture.md#document-registry).

- Persisted user-data handles and document-specific resource kinds remain a
  separate SDK slice. Remaining work:
  1. Settle long-term `DocumentNote` semantics for non-current documents:
     loading model, whether `getChildren()` can hydrate, and which operations are
     allowed before document content is loaded.
  2. Clarify the cross-document query/loading boundary, including
     whether cross-document link search should load trees directly or use a
     separate index/search layer.
  3. Update the durable docs once the cross-document query contract stabilizes:
     `docs/specs/outliner/note-model.md`, `docs/architecture.md`,
     and `docs/specs/outliner/links.md`.

## Client-side perf follow-ups

- Typing-latency optimizations: gate `SchemaValidationPlugin` validation and
  `RootSchemaPlugin` repair scans on dirty-set contents so leaf-only typing
  updates skip them; skip redundant structural-overlay and outline-selection
  store writes in `SelectionPlugin` when nothing changed.

## Frosted-glass material follow-ups

- The frosted-glass surfaces (app shell, header, mobile toolbar) use a
  translucent `color-mix` fill that relies on `backdrop-filter` for legibility,
  with no `@supports (backdrop-filter)` opaque fallback and no
  `prefers-reduced-transparency` handling. Where the blur is inert (some Android
  WebViews, reduce-transparency settings) content shows through. This is a
  consistent app-wide choice, not a per-surface bug — decide the fallback policy
  once for the shared `--remdo-glass-*` material rather than patching one surface
  (patching only the toolbar would fragment the material the token unified).

## Color standardization

- Standardize the app's colors on a single accent token. `--remdo-accent`
  (violet-3) now drives links (`.text-link`) and the brand mark, but other
  interactive/highlight colors are still ad-hoc Mantine blues — e.g. the editor
  bullet/checkbox/note-control hover (`--indicator-highlight-color` = `blue-3`)
  and the interaction focus/hover ring (`--interaction-accent-rgb` in
  `interaction.css`). Route these through the accent so hover/focus/link/brand
  read as one system. (Bullet-hover was tried and reverted — too subtle at the
  current bullet size to be worth a standalone change; fold it into the wider
  pass, and reconsider the highlight strength there.) The Home document rows
  (`.home-doc`) carry `remdo-interaction-surface` for its focus ring but hover
  via a separate `.home-doc:hover` background because nothing wires the surface's
  JS `data-active='hover'` state for them; unify that mixed hover model in this
  pass rather than wiring JS hover for one list.

## App-shell overflow vs inline menus

- The app-shell `.shell` card uses `overflow: hidden` (needed to clip its rounded
  corners) which becomes a clip box for inline dropdowns. The document switcher
  menu (`DocumentToolbar.tsx`, `withinPortal={false}`) and the note menu
  (`NoteMenuPlugin`, portaled into `.editor-container`) render inside it, so a
  menu opening past the card's edge could be clipped rather than overflow. Narrow
  exposure today (the card grows with content, and menus open near the top/mid),
  but if a clip is ever observed, portal those menus to `document.body`
  (`withinPortal`) rather than dropping the corner-clipping overflow. Deferred as
  a tradeoff — the safe fix touches menu components outside the styling change.

## App-shell layout container follow-up

- The header (`AppHeader.tsx` `Container size="xl"` + `.header .inner`) and the
  document route (`DocumentRoute.tsx` `Container fluid` + `main.document-route-container`)
  both use a Mantine `Container` whose max-width/gutter is then cancelled in CSS
  (`max-width: none` / `padding-inline: 0`), needing an element+class selector to
  outrank `.mantine-Container-root`. The Container contributes only its block
  padding. Consider dropping `Container` for a plain `<div>`/`<main>` and owning
  layout in the module CSS (removes the specificity workarounds and comments).
  Deferred as a tradeoff: it's an architectural call about whether the app shell
  keeps using Mantine's layout primitive, and the route Container's `py` was
  being hand-tuned — not a mechanical simplify.

## Client request follow-ups

- Audit timeoutless browser requests and define operation-specific deadlines,
  cancellation, and retry/idempotency semantics before extracting shared fetch plumbing.

## Test harness follow-ups

- Improve expected-console-issue ergonomics (`assertions/console.ts`): make
  allowlisting a genuinely-expected error (e.g. a benign 401 probe) a cheap
  one-liner-with-reason at the assertion site, so silencing it in code isn't the
  easier path. Keep the fail-closed gate; reword "failure" for expected issues.
- Redesign `toMatchOutline` note content expectations from flattened text into
  node-level content. Target shape:

  ```json
  { "noteId": "note1", "content": [{ "text": "before " }, { "date": "2026-06-10" }, { "text": " after" }] }
  ```

  Until then, flattened outline text stays readable/user-facing, while
  node-specific identity such as date ISO values stays covered by focused
  feature tests.
- Reduce repeated full-outline literals in tests by adding a generic helper
  that patches a previously-read outline by `noteId`, then still asserts with `toMatchOutline`.
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
  subprocess-spawning specs; verify with `test:collab:repeat`.

## Testing guidance follow-ups

- Review existing tests against the contributor
  [testing policy](dev/testing.md#coverage) and remove tests that merely mirror
  implementation without protecting behavior relied on by a user or component.

## Warning and drift detection follow-ups

- Decide whether to replace `pnpm dlx esbuild` in `docker/Dockerfile` with a
  lockfile-backed tool path or at least an exact version; Docker currently
  pulls a different `esbuild` than the workspace.

- Add more deterministic detection:
  1. Extend `tools/check-pnpm-policy.ts` to flag committed `pnpm dlx` usage so
     lockfile-bypassing tool installs cannot be added silently.
  2. Add a plain `pnpm run build` validation surface to CI and/or the dependency
     refresh flow so build warnings are reviewed explicitly instead of only via
     Docker logs.

- Warning policy / classify-or-suppress:
  1. Decide how to handle the Vite large-chunk warning: real size budget,
     accepted warning, or follow-up chunking work.
  2. Decide whether to fix or explicitly accept the Docker esbuild
     `import.meta`/CJS warning from bundling Node tools that import
     `config/index.ts`; the warning text includes `empty-import-meta` and `import.meta.env.MODE`.
  3. Decide how to handle the `snapshot.mjs` esbuild size warning in Docker:
     explicit budget, suppression, or accepted noise.
  4. Decide whether to suppress or just classify the `NO_COLOR` / `FORCE_COLOR`
     warnings seen during Docker Playwright runs.
  5. Decide whether to suppress, classify, or otherwise avoid Node's
     `ExperimentalWarning` noise from Better Auth's SQLite path in dev/test commands.
  6. Review current install-time warnings and classify each as `fix`, `track`,
     or `ignore`, especially:
     `glob@11.1.0`, `source-map@0.8.0-beta.0`, and `sourcemap-codec@1.4.8`.

## Note body follow-ups

Follow-ups to the spec in [docs/specs/outliner/body.md](specs/outliner/body.md):

- Undo does not restore selection under collaboration (Lexical's `@lexical/yjs`
  V2 history only persists structure, not the caret). This is global, not
  body-specific — RemDo's undo tests assert structure only. Decide if restoring
  selection on undo is worth wiring the Yjs `UndoManager` StackItem `meta`.

## Docs spec accuracy (branch docs/spec-accuracy)

- Doc↔code accuracy audit, area by area (outliner docs ↔ editor code/tests
  first): per claim — confirmed / fix the doc / record the divergence here per
  documentation.md invariant 4 / escalate unclear intent.
- Coverage pass: product areas with no owning doc (candidates: collaboration
  internals, app bootstrap/routes; note-sdk docs are already deferred under
  "Note-first SDK follow-ups") — decide new doc vs a `Future` trigger each.
- Parked escalations awaiting Piotr (five): [note-kind capabilities](specs/outliner/note-model.md#note-kinds)
  sentence (carries the selection link; reject / apply-with-link-relocation);
  [result-row context](specs/outliner/search.md#result-row-context) split; [selection mode-switch](specs/outliner/selection.md#selection-states) split;
  [dependency patches](specs/agents/skills/remdo-deps-refresh.md#dependency-patches) stage split (#5 of conv3); [search disambiguation](specs/outliner/search.md#behavior)
  parenthetical split.

## Skill architecture follow-ups

- Re-run a focused cross-skill centralization pass: check shared executable
  ownership, Git/scope guards, outcome contracts, reviewer transport, and report
  envelopes; decide only what needs one owner.
- Decide ESLint coverage for hidden skill roots (`.agents/skills/**/*.ts` and
  the remaining Claude-only `.claude/skills/**/*.ts`): the skill TS is now
  typechecked (tsconfig dot-include) and unit-run (embedded bridge), but ESLint
  still ignores dot-directories, so `lint:code` reports "File ignored" on those
  files and `pnpm run lint` silently skips them — the skill tools/specs miss the
  code-lint gate. Extend the ESLint config to the dot tree (deciding which rules
  apply to skill specs, e.g. the `node/no-process-env` disables), or accept
  typecheck+tests as their gate. A config decision, not a mechanical fix.

## Skill test-infra follow-up

- Consider replacing the skill-spec bridge (`tests/unit/skills/embedded.spec.ts`)
  with a vitest `test.projects` entry rooted at the hidden skill roots (currently
  `.agents/skills` plus Claude-only `.claude/skills`; hidden dirs are pruned by
  the file crawler, so include globs can't reach them); requires re-verifying
  `--changed` and forceRerunTriggers semantics across projects.

## Review and convergence follow-ups

- Widen the review lens for shared-state writes: change verification reviews a
  diff, so a bug where NEW code writes shared/global state and UNCHANGED code
  over-reads it sits outside scope (the PR#356 cross-user source-leak: new
  `source-links.ts` wrote a global `source_servers` row that the unchanged `listCurrentUserSourceServers`
  projected to every user). The GitHub Codex app caught it because it reviews the
  whole PR against the full repo, not the diff alone. Add a finder angle: when the
  diff writes to a shared cache/table/projection source, trace who *reads* that
  state (including unchanged files) and check the new state doesn't cross a
  tenant/user boundary. (Note the GitHub app and local `codex review` are the same
  model — the app's advantage was whole-repo scope, not a second sample; a second
  *local* codex pass would share the diff-only blind spot. Evidence: OpenAI tunes
  the reviewer for precision over recall, so misses are by design; keeping the
  wider-scope GitHub app enabled as a backstop is cheaper than re-sampling locally.)

## Later follow-ups

- Dead `oauthClientCredentials` wiring: the `OAuthClientCredentials` interface +
  the `oauthClientCredentials?` option thread `runtime.ts → createServerAuth →
  createBetterAuthInstance` to feed `generateClientId`/`generateClientSecret` on
  the `oauthProvider`, but nothing ever sets it (no producer, pre-existing). Now
  that sources issue only public secretless clients it is provably dead — drop the
  interface, the option field across the layers, and the generate-* spread so the
  provider uses Better Auth's own id generation.
- Auth provisioning concepts: revisit user creation, dev fixture users, OAuth
  client creation restrictions, and server registration as separate flows with
  clearer boundaries.
- Consider adding email verification, then review trusted-provider,
  implicit-linking, and related authentication policies together.
- Introduce a RemDo-owned, dialect-aware migration runner with ordered,
  transactional migrations before the next persisted-schema change.
- Once the runner exists, use it to drop `source_servers.client_secret`, then
  remove the temporary predecessor-shape acceptance and its test.
- Cross-server terminology: standardize OAuth/linking language around home
  server and source server, and keep "remote" only for unrelated generic cases.
- Dev script ergonomics: update normal dev launchers to pre-kill conflicting
  RemDo services in their own `PORT_BASE` block before starting, instead of
  adding separate restart scripts. Keep the behavior port-scoped and avoid the
  shared Chrome DevTools endpoint.
- Server routes follow-up: review the API endpoint set. Revisit endpoint names,
  grouping, browser-vs-server request boundaries, and whether any routes should
  move, merge, or be dropped. Consider a Hono `showRoutes()` dev helper or test
  for endpoint inventory after the route groups settle.
- Revisit client auth/bootstrap state caching once the auth and current-user
  model is more settled. The current lightweight bootstrap cache should
  eventually be keyed to the active Better Auth session, or invalidated by a
  clear shared auth-state boundary, so same-tab identity changes cannot reuse
  stale home/user-data document ids.

- Test-bridge registry (`testBridgeRegistry.ts`) hands the next mount to a
  pending `waitForNext()` FIFO. Entries are keyed by editor, so an editor
  re-publishing (its api rebuilds on collab-status changes) no longer steals
  another editor's waiter. Residual: two genuinely concurrent renders (not the
  sequential-await callers today) could still mispair on which mounts first; key
  waiters by docId if that ever arrives.

- `SchemaValidationPlugin` load-time validation (dev/test) has no test. No
  malformed fixture survives load unrepaired to demonstrate it: `assertEditorSchema`
  only checks `indent-jump`, which load normalization flattens. The validation is
  therefore practically inert today; add coverage if a schema rule that survives
  load is introduced.

- `OnlineGate` reconnect retry is bounded to `RECONNECT_RETRY_BACKOFFS_MS` per
  reconnect signal, so a server that recovers *without* a browser `online` event
  (transient 5xx / server restart while the network stays up) can leave the gate
  on "Connection unavailable" until the user clicks Retry. This is a deliberate
  tradeoff against the opposite failure — auto-hammering a genuinely-down server
  on every render — so the gate never polls indefinitely. Revisit only if the
  stuck-until-manual-retry case proves to hurt in practice (e.g. add a single
  long-delay final probe, or a visibilitychange-triggered re-arm).
