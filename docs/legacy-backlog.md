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

## Document access and sharing

- Cross-server document-id collision guard follow-up: source-link bootstrap,
  projection merge, and import flows should detect a source document whose
  `docId` collides with an already-known local or linked-source document and
  reject or quarantine it before opening.

## Offline and local persistence follow-ups

- Access-denied vs connection copy: distinguish collaboration authorization
  denial from an unreachable server when a user opens an inaccessible document
  directly.
- Offline collaboration retry follow-up: keep live-session reconnect retries
  from flooding diagnostics while preserving a clear disconnected state.

## Document import / upload follow-ups

The "Upload" document-switcher action (`PendingDocumentImportPlugin` + `pending-document-import.ts`).

- `await normalizeUpdate` / `await awaitSynced()` can hang forever: no
  timeout/noop guard, so a no-op normalize (clean backup) or a never-syncing
  provider leaves the import pending with no error.
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
- Home row menu buttons do not follow the
  [persistent active target](specs/outliner/menu.md#entry): each reveals only
  on hover or focus, and no row is the initial target.
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

## Frosted-glass material follow-ups

- The frosted-glass mobile toolbar uses a translucent `color-mix` fill that
  relies on `backdrop-filter` for legibility,
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

## Client request follow-ups

- Audit timeoutless browser requests and define operation-specific deadlines,
  cancellation, and retry/idempotency semantics before extracting shared fetch plumbing.

## Test harness follow-ups

- Reduce repeated full-outline literals in tests by adding a generic helper
  that patches a previously-read outline by `noteId`, then still asserts with `toMatchOutline`.
- Prefer this over property-specific helpers like `setFolded(...)`: tests stay
  focused on the changed notes while still verifying that untouched notes remain
  unchanged.
- Collab full-suite flakiness on high-core machines (CI unaffected): vitest
  forks scale to cores but the 5s timeout and single collab server don't. Cap
  `poolOptions.forks.maxForks` (~4 / `'50%'`) and raise the timeout on the
  subprocess-spawning specs; verify with `test:collab:repeat`.

## Warning and drift detection follow-ups

- Warning policy / classify-or-suppress:
  1. Decide how to handle the Vite large-chunk warning: real size budget,
     accepted warning, or follow-up chunking work.
  2. Decide whether to suppress or just classify the `NO_COLOR` / `FORCE_COLOR`
     warnings seen during Docker Playwright runs.
  3. Review current install-time warnings and classify each as `fix`, `track`,
     or `ignore`, especially:
     `glob@11.1.0`, `source-map@0.8.0-beta.0`, and `sourcemap-codec@1.4.8`.

## Note body follow-ups

Follow-ups to the spec in [docs/specs/outliner/body.md](specs/outliner/body.md):

- Undo does not restore selection under collaboration (Lexical's `@lexical/yjs`
  V2 history only persists structure, not the caret). This is global, not
  body-specific — RemDo's undo tests assert structure only. Decide if restoring
  selection on undo is worth wiring the Yjs `UndoManager` StackItem `meta`.

## Docs spec accuracy (branch docs/spec-accuracy)

- Parked escalations awaiting Piotr (five): [note-kind capabilities](specs/outliner/note-model.md#note-kinds)
  sentence (carries the selection link; reject / apply-with-link-relocation);
  [result-row context](specs/outliner/search.md#result-row-context) split; [selection mode-switch](specs/outliner/selection.md#selection-states) split;
  [dependency patches](specs/agents/skills/remdo-deps-refresh.md#dependency-patches) stage split (#5 of conv3); [search disambiguation](specs/outliner/search.md#behavior)
  parenthetical split.

## Skill architecture follow-ups

- Decide ESLint coverage for hidden skill roots (`.agents/skills/**/*.ts` and
  the remaining Claude-only `.claude/skills/**/*.ts`): the skill TS is now
  typechecked (tsconfig dot-include) and unit-run (embedded bridge), but ESLint
  still ignores dot-directories, so `lint:code` reports "File ignored" on those
  files and `pnpm run lint` silently skips them — the skill tools/specs miss the
  code-lint gate. Extend the ESLint config to the dot tree (deciding which rules
  apply to skill specs, e.g. the `node/no-process-env` disables), or accept
  typecheck+tests as their gate. A config decision, not a mechanical fix.

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

- Consider adding email verification, then review trusted-provider,
  implicit-linking, and related authentication policies together.
