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

### Django backend replacement

Rebuild the application backend around Django, minimizing custom infrastructure
and operational work through established libraries and services.

- **Target:** Django owns authentication, authorization, application metadata,
  migrations, administration, and Y-Sweet token issuance. Retain the existing
  frontend/editor and Yjs/Y-Sweet document collaboration. Replace Yjs
  app-resource projections with established server-state/cache tooling; TanStack
  Query/DB are candidates, not commitments.
- **Approach:** Create temporary integration branch `feat/django-backend` from
  `main`, recording the starting commit as the behavioral reference. Create
  small implementation branches from it; their PRs target and are reviewed
  against it under [Git Workflow](../CONTRIBUTING.md#git-workflow). Temporary
  missing functionality is acceptable; completed slices must work and pass
  relevant checks. Retain useful unaffected code, without backward
  compatibility, legacy-data migration, or keeping the old backend operational.
  Merge the integration branch into `main` only after a separate whole-migration
  review and full verification against the completion criteria below, then
  retire it.
- **Starting commit:** `668e3729b94f42be4bc54f20c36fd78575a21155` (`main`).
- **Completion:** Deliver a working development baseline. Retire the old
  runtime, except reference code retained for the [cross-server redesign](#cross-server-linking-redesign). Verify
  all [run modes](run-modes.md), local sharing, offline behavior, account/instance cache
  isolation, and ordinary data/secret persistence through restart and
  redeployment. Record deliberate behavior changes in their owning
  specifications.
- **Milestone boundary:** Merging into `main` does not establish public-release
  readiness or the final data reset; further destructive resets remain
  permitted. [Hocuspocus migration, backup/recovery, and public-release readiness](#operations)
  are separate post-merge milestones. Other backlog entries do not expand
  migration scope.
- **Remaining checks:** verify actual Render deployment and public-certificate
  issuance using [Production Deployment](guides/production-deployment.md), and confirm rootful Docker coverage
  from CI.
  Complete the whole-migration review and verification, including an audit of
  migration-only tooling outside the [retained reference-code exception](#cross-server-linking-redesign).

Simplification follow-up:

1. [x] Delegate administration authentication to the [shared allauth sign-in](specs/access/access-control.md#admin-role),
   applying its rate limits and browser login handoff while retaining Django
   staff and model authorization.
2. [x] Move reference-only `@better-auth/core`, `@better-auth/oauth-provider`,
   `better-auth`, `better-sqlite3`, `hono`, and `kysely` to development dependencies
   and align production audit roots. Preserve the [retained reference code](#cross-server-linking-redesign)
   and active snapshot tooling.
3. [x] Remove the discarded sync-token probe and its document-route loading gate.
   Let the collaboration provider authorize access; use the generated API client
   for its local token request while preserving cancellation and offline editing.
4. [x] Remove retired Node authentication checks and eager trusted-origin
   calculation from active frontend configuration. Keep Django responsible for
   live authentication settings, including its development secret, and localize
   reference-only configuration to retained code.
5. [ ] Remove the unused `publicServer` flag from active Django responses,
   generated types, bootstrap storage, and fixtures. Preserve reference-code
   consumers and the still-used CSRF fields.

### Cross-server linking redesign

Redesign cross-server document access after the Django migration. Local
sharing stays supported. Decide source discovery/registration, independent
identities, consent scope, refresh/relink/unlink, private-instance
reachability, failure reporting, and cache isolation together. Reconsider
public signup independently of linking; preserve the [multi-origin direction](principles.md#multi-origin-direction)
without committing to the previous OAuth topology.

To avoid reviewing temporary architecture twice, retain the unused Node
backend, source adapters, projections, linking scripts/tests, and their
dependencies as reference code until this redesign. They do not provide supported
cross-server functionality. Replace or remove them together with the redesign;
do not migrate or extend them as a Django completion requirement. The
withdrawn source-linking specification remains in Git history.

### Account administration

- **Coherent email editing after Django integration.** Constrain operator email
  changes to one identity model across `User.email`, allauth primary/login
  addresses, session display, and local sharing lookup. Editing the user alone
  can leave the old primary address usable for login while sharing uses the new
  address. Align fixture provisioning with production account creation; prefer
  restricting duplicate writers over adding public email management.

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

- **Hocuspocus migration.** Replace Y-Sweet with Hocuspocus after the Django
  integration merges. Reassess collaboration, persistence, and runtime
  boundaries when scoping the work.

- **Backup and recovery.** After Hocuspocus, define and verify coherent recovery
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

### SDK

- **Simplify SDK consumer types.** Review consumers beyond the mobile toolbar
  for narrowing driven only by test setup and duplicate local types. Prefer
  existing public types at meaningful boundaries; retain narrower contracts
  when they provide a concrete benefit, following [SDK design](dev/sdk.md).

- **SDK API validation.** Evaluate completion and unavailable-target outcomes
  when a consumer needs to
  know whether an operation took effect. Evaluate query and app-resource reads
  in their own workflows using the [design principles and references](dev/sdk.md). Reassess
  generated record/query APIs versus note-shaped application resources with Home
  and Sharing consumers as Home, offline, and source requirements become
  clearer; the cache library does not settle the public SDK shape.

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

  Reassess whether app-resource projections need Yjs or would be simpler with
  established server-state/cache tooling, including its observation API. The
  [document registry](architecture.md#document-registry) owns the current storage boundary; this comparison
  concerns app resources, not replacement of collaborative document storage.
  Choose tools against a concrete consumer and the [performance work](#performance), not the
  existing projection layout. Coordinate resource-read changes with the
  [offline document-inventory follow-up](architecture.md#future), and non-current-document access and
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

- **Body-local command targets.** Target behavior ([Body](specs/outliner/body.md#selection-and-structural-targeting), [Indentation](specs/outliner/indentation.md#target-resolution), [Reordering](specs/outliner/reordering.md#target-resolution),
  [List types](specs/outliner/list-types.md#toggling), [Mobile toolbar](specs/outliner/mobile-toolbar.md#actions), and [Menu](specs/outliner/menu.md#behavior)): a caret or inline text selection
  inside a body targets its owning editor note for commands that act on a note.
  The structural resolver handles a collapsed body caret, but a body-local
  inline selection produces no range, leaving indentation, reordering, and
  toolbar deletion as no-ops. `$resolveToggleTargets` and
  `$resolveFocusNoteKey` use body-rejecting content resolution, leaving
  checked-state toggles, focus-note toolbar actions, and the double-Shift menu
  as no-ops. Align shared body-to-owner resolution and add focused coverage for
  each affected command path.

- **Zoom-root toolbar deletion.** Target behavior
  ([Mobile toolbar](specs/outliner/mobile-toolbar.md#actions)): the current zoom
  root supplies no delete target. `$resolveSelectedNotesDeletion` currently
  resolves that note, so toolbar availability reports Delete as enabled and
  command application can use the same target. Reject the zoom root in the
  deletion owner's target resolution so availability and application agree,
  then cover both the owner seam and toolbar delegation.

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

- **Report Y-Sweet's pending-connection cancellation bug upstream.** In
  `@y-sweet/client` 0.9.1, start `connect()` with a deferred token callback, call
  `disconnect()`, then resolve or reject the callback. The departed attempt can
  still open a socket or report a token failure and retry; calling `connect()`
  again before it settles is refused because the old loop remains active. This
  breaks page departure and Back/Forward-cache restoration.

  File an upstream issue with a minimal reproduction and propose the
  cancellation fix in the [registered client patch](../patches/@y-sweet__client@0.9.1.patch). Preserve genuine failures
  for active attempts. The [provider lifecycle regressions](../tests/unit/collab/provider-page-lifecycle.collab.spec.ts) and
  [native cache tests](../tests/e2e/app/collaboration-lifecycle.spec.ts) cover the behavior, including shared token consumers.
  Remove the patch when a released client passes that coverage without it.

### UX direction

These proposals guide the next UX slices; unresolved choices remain proposals
until accepted in their behavioral owners. Defer a command palette and action
menus on every breadcrumb until improving the existing surfaces leaves a
concrete unmet need.

- **Location header and document actions.** Deliver the [document rename capability](specs/outliner/location-header.md#document-rename),
  then document-root and Home menus, then the [persistent menu target](specs/outliner/menu.md#entry). The
  [legacy implementation gaps](legacy-backlog.md#home-and-location-header-follow-ups) track the missing surfaces and storage path.

- **Zoomed-note location header.** Complete the rich editable header and its
  applicable note, children, and view actions, preserving the
  [selection boundary](specs/outliner/location-header.md#structural-boundary). Validate keyboard access,
  leaf zoom, repeated heading-and-child edits, rich links, and selection-boundary
  discoverability before replacing the existing zoom-root row. Reconsider
  explicit inline Edit/Done only if those tasks expose a persistent problem; a
  rich-note draft modal is outside this work.

- **Document deletion.** Decide permissions, effects on collaborators and
  linked sources, and recovery or confirmation before adding deletion to
  document menus. Deliver rename first; document destruction is separate from
  structural note deletion.

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
