# RemDo TODO

This ledger is RemDo's near-term backlog and single entry point for
[tracked follow-up](documentation.md#target-behavior). It also holds cross-cutting temporary state.

The closed [legacy backlog](legacy-backlog.md) holds earlier unresolved
entries. Continue checking its entries for duplicates and review suppression
until they are resolved or migrated.

## Tracked follow-up

Record code-local follow-up in [tracked comments](../CONTRIBUTING.md#code-comments), long-horizon
follow-up in the owning specification's [`Future`](documentation.md#future)
section, and other work intended to be done soon in this backlog or a temporary
migration ledger explicitly linked from it. Together, these locations form the
tracking record; do not duplicate an item between them.

Run `pnpm run todo:list` when selecting maintenance work or auditing tracked
follow-up. It lists candidate `TODO` and `FIXME` occurrences in tracked
non-documentation files; inspect the results under the tracked-comment
convention above.

A reviewer suppresses a finding as already tracked only when the tracking
record covers the reported gap. Within this backlog, group related items under
short topic headings. Remove rejected or obsolete items and empty sections.

## Backlog

### Backend follow-up

- Verify actual Render deployment and public-certificate issuance using
  [Production Deployment](guides/production-deployment.md), including health-prober compatibility with
  `ALLOWED_HOSTS`. Rootful Docker coverage is exercised by the default CI runner.
- Reconsider the remaining simplifications withheld by the Django review:
  `CenteredCardPage` and the [UI library default](../CONTRIBUTING.md#ui-libraries), app route enumeration,
  port-rule ownership, the always-Python `setup-pnpm` composite, the Docker
  build-revision mismatch block, long Docker specs, and `revokeServerSession`'s
  two-phase bound.

### Cross-server linking redesign

Redesign cross-server document access after the Django migration. Local
sharing stays supported. Decide source discovery/registration, independent
identities, consent scope, refresh/relink/unlink, private-instance
reachability, failure reporting, and cache isolation together. Reconsider
public signup independently of linking; preserve the [multi-origin direction](principles.md#multi-origin-direction)
without committing to the previous OAuth topology.

The withdrawn Node backend, source adapters, projections, linking
implementation, and specification remain available in Git history as reference.
Their future redesign does not require maintaining an operational legacy
implementation.

### Post-Hocuspocus simplification proposals

Proposals from a read-only assessment of what the Hocuspocus migration leaves
over-general, given a full data reset with no migration or backward-compatibility
obligation. Each was filtered by whether it would exist in a from-scratch
Hocuspocus and Django design. They are candidates, not accepted work; resolve
each against its current owner before acting, and remove entries that assessment
rejects. Evidence and the rejected alternatives are recorded in
`.agent/post-ysweet-simplifications.md`.

Code items assume no contract change:

1. **Collaboration state and provider adapter.** `sawProviderAck` masks
   Y-Sweet's unacknowledged-at-construction sentinel, which Hocuspocus cannot
   reproduce; the `handshaking` connection status has no writer; `setDocId` and
   `awaitHydrated` have no production callers; and the neutral provider-event
   vocabulary abstracts over a single provider. Rewrite the specs that pin the
   masked state to the real invariant rather than deleting them.
2. **Launcher attaches to an occupied collaboration port.** `ensureCollabServer`
   defaults to reusing a server already listening, so a second working directory
   runs against another instance's collaboration server. This contradicts the
   launcher rule in [Configuration](specs/runtime/configuration.md#network-addressing)
   and defeats `PORT_BASE` isolation. Resolve before the broader launcher work
   under [Tooling](#tooling); it is a behavior gap, not only simplification.
3. **Collaboration launcher asymmetry.** The development collaboration script
   spawns a detached child rather than executing the server directly as the API
   script does, which also routes its output to a log file instead of the
   aggregated development output. Collapsing it removes the spawn helper and one
   of four copies of the wait-for-port loop. Coordinate with
   [Tooling](#tooling)'s launcher-complexity entry.
4. **Browser collaboration origin selection.** The client still chooses which
   origin hosts collaboration, including a fallback that cannot resolve because
   its configuration keys are not browser-exposed. [Architecture](architecture.md#routing-and-origin-boundary)
   already states that browser collaboration uses the current same-origin
   endpoint; the client has not caught up.
5. **Single-source document residue.** Production supplies exactly one hard-coded
   document source, leaving statically false branches in the toolbar's label
   qualification, the source-local action split, and the workspace source
   lookup. Removing the dead branches is independent of the visible grouping in
   the Current Server decision below.
6. **Duplicated server contract types.** The hand-written user-document and
   document-access interfaces mirror serializers that the generated API schema
   already describes, following the precedent already used for the current-user
   payload. Aligning optionality removes a hand-maintained drift risk.
7. **Test-only flexibility in product code.** The collection-source input
   normalization exists so tests can pass plain arrays; production always passes
   a live source.
8. **Repeated internal-service constants and helpers.** The container port pair
   is hard-coded in three places after its configuration helper lost its
   Y-Sweet job; three credential-injecting WebSocket subclasses differ only by
   header; and an origin-printing script spawns a runtime to echo a value its
   caller already exports. Test-support consolidation belongs with
   [Tooling](#tooling)'s test-organization entry.

Decisions requiring a contract owner's judgement:

1. **Encrypted local persistence.** The browser cache reimplements offline
   encryption that Y-Sweet previously supplied, as a hand-owned store combining
   AES-GCM, key-generation epochs, two lock mechanisms, cross-tab notification,
   and compaction. [Logout](specs/access/access-control.md#logout) requires both
   bounded local completion and cleared local Yjs data, and key deletion
   currently satisfies both. Replacing it with an established IndexedDB provider
   requires accepting that an undeletable database leaves readable data on the
   device, which is a [privacy-first](principles.md#non-negotiables) decision
   rather than cleanup. Decide the threat model before the implementation.
2. **Current Server grouping.** Collapsing the remaining source abstraction
   depends on whether [Home](specs/outliner/home.md) keeps a visible source
   grouping and its local-source document action. Decide Home's shape first;
   the [multi-origin direction](principles.md#multi-origin-direction) does not
   require the present implementation.
3. **Collaboration database access boundary.** Routing content load and store
   through Django costs a bespoke loopback HTTP client preserving the canonical
   host, paired constant-time secret checks, and gateway header stripping.
   Direct database access from the collaboration server would remove that
   plumbing but place credentials in a second writer, which the
   [architecture test](principles.md#architecture-test) disfavors. The narrower
   question is whether the canonical-host workaround still earns its place.
4. **Withdrawn federation vocabulary.** [Architecture](architecture.md) still
   presents source-server and multi-hub vocabulary as current architecture
   although its implementation, specifications, and tests were withdrawn. Trim
   it to the retained principle and let the [linking redesign](#cross-server-linking-redesign)
   introduce vocabulary when it lands. This is the doc prose only, not the
   redesign that entry tracks.

### Account administration

- **Coherent email editing after Django integration.** Constrain operator email
  changes to one identity model across `User.email`, allauth primary/login
  addresses, session display, and local sharing lookup. Editing the user alone
  can leave the old primary address usable for login while sharing uses the new
  address. Prefer restricting duplicate writers over adding public email management.

### Documentation

- **Remaining agent-flow specification alignment.** Reassess [`remdo-verify-change`](specs/agents/skills/remdo-verify-change.md)
  and [`remdo-deps-refresh`](specs/agents/skills/remdo-deps-refresh.md) under the structured-algorithm guidance.
  Align each specification as a whole contract with one clear behavioral account
  while preserving accepted behavior and material edge paths; avoid mechanical
  notation-only conversions.

- **Remaining agent skill alignment.** Apply the adopted
  [specification/procedure boundary](documentation.md#agent-skill-boundary) to
  the remaining skills. Reconsider custom scripts and state machines that encode
  adaptive work without enough robustness to justify their maintenance. Prefer
  concise intent plus deterministic checks of stable repository invariants,
  then align each affected specification, procedure, implementation, and coverage.

- **Remaining skill-spec ownership boundaries.** Continue verifying ownership between
  agent skill specifications and shared contracts such as [Contributing](../CONTRIBUTING.md).
  Keep capability behavior with its skill and shared policy with the broader owner.
  Update links and remove restatements in the same change.

- **Condition ownership beyond capability calls.** Evaluate whether the
  [capability protocol](specs/agents/protocol.md) should generalize to other
  component boundaries. Define how independently invocable and
  invalidation-prone boundaries establish conditions without redundant checks.

- **Large-scope documentation alignment.** Evaluate the structured finding
  schema and parallel specialist-reviewer layout from the Upkeep skill
  (wei18/Upkeep) as a way to speed alignment over large scopes.

- **Skill-prose pressure testing.** Evaluate superpowers `writing-skills`
  adversarial subagent trials as an additional check for skill-file prose.

- **Markdown link-aware wrapping.** Define rendered-width paragraph reflow that
  preserves natural sentence and clause boundaries while ignoring hidden link
  and image destinations. Determine viable deterministic premature-wrap checks
  that do not require mechanical greedy reflow, then align maintained prose.

### Dependencies

- **Dependabot pnpm 11 version updates.** When GitHub's [supported-ecosystems table](https://docs.github.com/en/code-security/reference/supply-chain-security/supported-ecosystems-and-repositories)
  lists pnpm v11, add `.github/dependabot.yml` for the root pnpm workspace,
  verify that its first update preserves workspace catalogs and passes a frozen
  lockfile install, and narrow or retire `remdo-deps-refresh` so dependency
  update discovery has one owner.

### Performance

- **Client performance contract.** Turn the [interaction and discovery principles](principles.md#interaction-and-discovery)
  into measurable targets and evidence, including editing responsiveness,
  search opening, and query updates across representative document sizes and
  devices. Assess CPU and memory costs alongside user-visible latency. Reassess
  the existing non-collaboration Vitest benchmark's workloads, operations,
  metric, and runner, then establish a specification and align or replace the
  harness. Use the evidence to select bounded optimizations rather than
  presupposing an index, worker, or library.

### Operations

- **Expired Django sessions after integration.** Define how supported
  deployments invoke Django's existing expired-session cleanup. Reuse framework
  maintenance without introducing a general worker or scheduler architecture for
  this task.

- **Durable collaboration acknowledgements.** [Synced](architecture.md#hydration-vs-sync) currently acknowledges
  receipt in the collaboration server before SQL persistence. The accepted crash
  window can lose acknowledged edits and grows during database outages. Design
  durable-save acknowledgements and their browser/logout semantics when stronger
  guarantees are required; headless writes already require a committed
  persistence barrier.

- **Backup and recovery.** Define and verify coherent recovery
  for [supported deployments](guides/production-deployment.md), covering application metadata, document content,
  and secrets. The Django image has no scheduled exporter or backup scheduler.
  Reassess readable exports, scheduling, maintenance-failure behavior, and
  legacy backup tooling together rather than carrying forward the old design as
  requirements.

- **Production secret initialization.** Revisit [secret bootstrap](specs/runtime/configuration.md#secret-bootstrap) ownership
  alongside runtime changes. Evaluate explicit initialization before Django
  startup rather than generation during settings loading; keep the mechanism
  open and preserve convenient first setup and refusal to replace missing
  secrets for an existing dataset.

- **Public-release readiness.** Reassess the remaining requirements for
  admitting public users after collaboration and recovery work.

### Claude MCP: save a conversation to RemDo

Goal: a Claude web custom connector that saves a conversation outline into a
RemDo document, minimal but useful for real work.

Suggested approach; reconfirm each decision before specifying or implementing
it:

- A stateless Node process hosts the note SDK server-side; MCP is a thin
  adapter over it, routed by the [gateway](architecture.md#gateway) at `/mcp`.
- The host acts only with the caller's credential. Django decides access as
  the OAuth authorization server and accepts the delegated bearer principal on
  existing API and collaboration authorization; the hub enforces it; the host
  holds no internal secret. Delegated access is the separate authentication
  contract that [CSRF Protection](specs/access/access-control.md#csrf-protection)
  requires for cross-site credentialed APIs.
- Tools speak the adapter-neutral [note model](specs/outliner/note-model.md)
  (parent note, note subtree), not Lexical or document-specific terms.
- A write reports success only after the database commits, through the
  [headless persistence barrier](architecture.md#hydration-vs-sync) made
  available to user-authorized clients. Coordinate with durable collaboration
  acknowledgements under [Operations](#operations).

Steps, each moving its settled decisions into their owners and out of this
entry:

1. Headless SDK host replacing `withHeadlessCollabSession`, with the
   user-authorized commit barrier. Addressed fold and child-list-type
   operations still depend on browser command handlers.
2. Delegated OAuth in Django, with revocation.
3. MCP adapter over [session insertion](specs/outliner/insertion.md#session-insertion),
   process wiring, and end-to-end coverage.
4. Connect-Claude guide and trial on the hosted instance.

Steps 1 and 2 are independent; step 3 depends on both. Open decisions: client
registration (dynamic or pre-registered), default save target, and tools beyond
saving.

### SDK

- **Open document session scope.** Rename the
  [open document session](specs/outliner/document-session.md) after what it
  owns — cross-operation rules of the document API — and separate
  interactive-editor context (focus, selection, view) from view-independent
  document operations that headless hosts also provide.

- **Simplify SDK consumer types.** Review consumers beyond the mobile toolbar
  for narrowing driven only by test setup and duplicate local types. Prefer
  existing public types at meaningful boundaries; retain narrower contracts
  when they provide a concrete benefit, following [SDK design](dev/sdk.md).

- **SDK API validation.** Evaluate query and app-resource reads
  in their own workflows using the [design principles and references](dev/sdk.md). Reassess
  generated record/query APIs versus [user data notes](specs/outliner/user-data.md)
  with Home and Sharing consumers as Home, offline, and source requirements
  become clearer; the cache library does not settle the public SDK shape.

  Keep model and API choices open to revision throughout this SDK initiative.
  Revisit them when consumer evidence reveals friction or a better fit, and
  update the design guidance, affected behavior owners, and [showcases](../src/note-sdk/note-sdk-showcase.spec.ts) with each
  changed decision. Before closing the SDK work, reconcile those artifacts with
  the final choices and explicitly track any remaining gaps.

- **Note-centered SDK consumer boundary.** The
  [open document session](specs/outliner/document-session.md) now owns the first
  settled slice around the shared [note model](specs/outliner/note-model.md):
  addressed-note access and observation, observable action capabilities, and
  semantic operations. [Search](specs/outliner/search.md) requests results through
  the session. The [mobile toolbar](specs/outliner/mobile-toolbar.md) and [quick action menu](specs/outliner/menu.md) consume its
  capabilities and operations; editor bindings resolve menu targets to stable
  note identity.

  Use real consumers, including keymaps, to improve the SDK, not merely to
  migrate calls behind its existing API. Data access, queries, and observation
  are equally valid starting points when a consumer exposes a more important
  gap. Choose small slices by
  consumer value rather than a fixed PR sequence, following the
  [consumer API principles](principles.md#consumer-apis) and the session's ownership boundaries. Preserve each
  operation's owning behavior while reconsidering the SDK shape.

  Keep resource reads aligned with the [document registry](architecture.md#document-registry) and choose tools
  against a concrete consumer and the [performance work](#performance). Coordinate
  resource-read changes with the [offline document-inventory follow-up](architecture.md#future), and
  non-current-document access and
  cross-document query/loading with the
  [legacy Note-first SDK follow-ups](legacy-backlog.md#note-first-sdk-follow-ups).

  Success is a simple SDK surface for note access, observation, queries, and
  operations without adapter-specific semantic logic in consumers. Keep
  capabilities at their natural scope rather than forcing every operation onto
  one note. Do not preselect a generic action registry, flat API, final SDK or
  package name, plugin contribution framework, or second-adapter implementation.

  At the start and close of each slice, locate related entries across
  the [tracking record](#tracked-follow-up), the
  [legacy backlog](legacy-backlog.md), and relevant Git history. Treat them as
  informative evidence rather than requirements or a predetermined API, then
  migrate, rewrite, or remove them according to current owners and what remains
  useful.

### Outliner

- **Touch and menu entry for note bodies.** [Body](specs/outliner/body.md#core-behavior)
  creation is reachable only through `Shift+Enter`, so touch devices cannot add
  a body at all, and iOS hardware keyboards can report `Enter` as
  `Shift+Enter` when auto-capitalization fires. Add an add/focus-body action to
  the [note menu](specs/outliner/menu.md) and the
  [mobile toolbar](specs/outliner/mobile-toolbar.md#actions) with the same
  add-or-focus semantics as the key gesture, and cover both surfaces.

### Upstream reports

- **Report the Lexical `updateEditorSync` warning upstream.** A commit that
  moves the DOM selection emits a Lexical dev warning through an entirely
  internal chain: `$commitPendingUpdates` → `$updateDOMSelection` →
  `setDOMSelectionBaseAndExtent` → the browser's native `selectionchange` →
  Lexical's `eventHandler` → `dispatchCommand(SELECTION_CHANGE_COMMAND)`, whose
  `triggerCommandListeners` wraps the listener pump in `updateEditorSync`
  whenever a listener set is non-empty — regardless of whether any listener
  mutates. No repository-side change suppresses it; Lexical's own rich-text
  listeners are enough to trigger it. The warning arrived in v0.49.0 with
  [facebook/lexical#8863](https://github.com/facebook/lexical/pull/8863), whose
  thread does not discuss this internal path, and no upstream issue reports it.
  The [registered `lexical` patch](../pnpm-workspace.yaml) gates the warning on
  `isCommittingPendingUpdates` meanwhile. That flag spans the whole commit, so
  the patch also silences genuine repository-side mistakes — a mutation or
  update listener dispatching a mutating command would now defer silently
  instead of warning. File the upstream report, then drop the patch once a
  release fixes it.

### UX direction

These proposals guide the next UX slices; unresolved choices remain proposals
until accepted in their behavioral owners. Defer a command palette and action
menus on every breadcrumb until improving the existing surfaces leaves a
concrete unmet need.

- **Location header and document actions.** Rename and the Home row menu ship;
  the document-root header and its menu remain, then the
  [persistent menu target](specs/outliner/menu.md#entry), which Home rows approximate with a
  hover- and focus-revealed button in a reserved gutter. The
  [legacy implementation gaps](legacy-backlog.md#home-and-location-header-follow-ups) track the missing surfaces.

- **Zoomed-note location header.** Complete the rich editable header and its
  applicable note, children, and view actions, preserving the
  [selection boundary](specs/outliner/location-header.md#structural-boundary). Validate keyboard access,
  leaf zoom, repeated heading-and-child edits, rich links, and selection-boundary
  discoverability before replacing the existing zoom-root row. Reconsider
  explicit inline Edit/Done only if those tasks expose a persistent problem; a
  rich-note draft modal is outside this work.

- **Session end while the app is open.** Decide what a mounted app shows when the
  server session expires or is revoked. Today the document listing keeps
  rendering its cached contents, then an alert offers a Retry that refetches
  against the ended session and fails again; the stale list stays clickable, and
  opening a document is what incidentally reaches the route loader's redirect.
  The alert now carries the failure's message, so an expired session reads
  differently from an unreachable server. Still to decide: whether an
  authentication failure gets its own surface with a route to sign-in rather than
  a Retry that cannot succeed, and whether that surface replaces the stale
  listing. Server-side [expired-session cleanup](#operations) is separate.

- **Sharing surfaces.** Share `400` responses flatten to one message that
  contradicts the self-share and malformed-address cases. The empty-state and
  reselect presentations retired with the standalone route's document picker.

- **Link sharing.** The [share surface](specs/access/access-control.md#document-sharing) renders a disabled General
  access section: no endpoint issues, resolves, regenerates, or revokes a
  bearer link, and no client state stands in for one. Define the behavior in
  [Access Scope](specs/access/access-control.md#access-scope), which currently
  excludes links carrying bearer credentials, before implementing it; the
  contract's [future](specs/access/access-control.md#future) records the same gap.
  Grant revocation is unbuilt, so the surface lists recipients without removing
  them.

- **Document deletion in open sessions.** [Document deletion](specs/access/access-control.md#document-deletion) ships from
  Home row menus, but other sessions do not learn of it as specified. Django
  does not notify the collaboration hub, which closes a deleted document's
  connections only when its next store fails, and hub authorization maps a
  missing document to the same denial as refused access. An open editor
  therefore shows a connection error instead of leaving for Home, which has no
  notice surface. Devices keep their encrypted local copy, since local
  persistence has no per-document purge.

- **Contextual menus across desktop and touch.** Keep the [note menu](specs/outliner/menu.md) available
  on both, with discoverable keyboard entry and an easily reachable More action.
  Let the [touch toolbar](specs/outliner/mobile-toolbar.md) accelerate frequent editing actions; reassess whether
  reaching its menu should require horizontal scrolling. Align action names,
  availability, selection targets, and focus restoration across surfaces,
  following the [SDK capability work](#sdk) without adding a generic command system.

- **Home and document switching.** Provide quick document filtering with clear
  search scope before retiring the picker. Preserve a fast keyboard path
  between documents; retain
  a distinct quick switcher only if it still serves a separate need. Coordinate
  with the [legacy Home follow-ups](legacy-backlog.md#home-and-location-header-follow-ups), and judge consolidation by switching speed
  and clarity rather than duplicate destinations alone.

### Agents

- **Capability protocol adoption.** Identify agent capabilities used as
  composable participants, give their specifications explicit `Call` and
  `Result` sections conforming to the [capability protocol](specs/agents/protocol.md), then align their execution
  procedures. Do not invent calls for developer-facing entry points.

- **Configured-upstream synchronization.** Design a capability separate from
  [`remdo-merge-main`](specs/agents/skills/remdo-merge-main.md) that synchronizes
  the current branch with its configured upstream. Classify fast-forward,
  local-ahead, ordinary divergence, and likely rewritten upstream history before
  choosing merge or explicitly authorized rebase, with conflict and recovery
  behavior defined for each path. Keep `origin/main` integration owned by `remdo-merge-main`.

- **External dependency verification.** Define how implementation work checks
  current authoritative documentation or public APIs for external dependencies
  before using [empirical checks](dev/testing.md#empirical-checks).

- **Repository annotation discovery.** Define a closed registry for searchable,
  repository-owned annotations, initially verification classifications and
  code-local `TODO`/`FIXME`, with each family owning its scope, trigger, required
  response, discovery, and lifecycle. Evaluate namespaced Markdown syntax and a
  simple typed discovery command that preserves `todo:list`, then make applicable
  agent review workflows invoke the relevant view. Exclude external-tool
  directives, and do not treat discovery as proof that an obligation is satisfied.
  Examples: Deterministic check, Empirical check, Deterministic/agentic?
  implementation (for skills' specs)

- **Structured reviewer results.** Evaluate provider-supported structured
  findings, such as JSON Schema output, without weakening native review or
  evidence. If viable, define verifier normalization into the shared [agent result](specs/agents/protocol.md#results).

- **Post-skill retrospectives.** Make an on-demand retrospective available
  after skill runs, using saved session logs to explain elapsed time, repeated
  or costly work, and concrete lessons. Add dedicated orchestration or
  instrumentation only if real retrospectives show that the existing evidence
  is insufficient.

### Tooling

- **Development setup and workflow.** Allow per-checkout backend settings
  overrides and reduce setup and launcher complexity in [local development](guides/local-development.md).
  Preserve independent instances and Node-independent backend commands; reassess
  mechanisms when resuming.

- **Test organization.** Reassess fixture and suite boundaries without reducing
  meaningful collaboration coverage; keep reorganization separate from
  migration-required test adaptation.

- **Upstream ast-grep project-config validation.** Contribute upstream support
  for rejecting unknown project-config keys or shipping version-matched schemas
  with `@ast-grep/cli`, then replace the repository-owned config validator with
  that upstream mechanism.
