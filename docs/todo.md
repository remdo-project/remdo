# RemDo TODO

This ledger is RemDo's entry point for [tracked follow-up](documentation.md#target-behavior) and holds
cross-cutting temporary state.

Record code-local work in [tracked comments](../CONTRIBUTING.md#code-comments), long-horizon work in the owning
specification's [`Future`](documentation.md#future) section, and near-term work here or in a temporary
migration ledger linked from here. These locations and unresolved entries in
the [legacy backlog](legacy-backlog.md) form the tracking record. Record each item once.

Run `pnpm run todo:list` when selecting maintenance work or auditing follow-up;
inspect its candidate `TODO` and `FIXME` comments under the tracked-comment
convention.

Suppress review findings as already tracked only when the tracking record
covers the reported gap. Group related backlog items under short topic
headings; remove rejected or obsolete items and empty sections.

## Backlog

### Cross-server linking redesign

Redesign cross-server document access after the Django migration. Local
sharing stays supported. Decide source discovery/registration, independent
identities, consent scope, refresh/relink/unlink, private-instance
reachability, failure reporting, and cache isolation together. Preserve the
[multi-origin direction](principles.md#multi-origin-direction) without
committing to the previous OAuth topology.

Evaluate representing a connected server as a [note kind](specs/outliner/note-model.md#note-kinds) whose children expose
its documents. Coordinate that interaction model with [cross-source discovery](#cross-source-discovery).

The withdrawn Node backend, source adapters, projections, linking
implementation, and specification remain available in Git history as reference.
Their future redesign does not require maintaining an operational legacy
implementation.

### Cross-source discovery

- **Cross-document search.** Extend [discovery](principles.md#interaction-and-discovery) beyond one active document,
  including documents on connected servers. Settle query coverage, freshness,
  access changes, and unavailable sources before choosing direct document
  loading or a derived search index. Coordinate the UI, [note-link picker](specs/outliner/links.md#future), and
  [MCP](#claude-mcp-save-a-conversation-to-remdo) through shared SDK operations. For documents in workspaces, the
  [text format migration](#text-format-migration)'s note layer step covers search.
- **Unopened documents.** Settle host-owned acquisition of non-current documents,
  content retention, and offline availability under the [open-document read boundary](specs/outliner/open-document.md#state-and-observation).
  Reassess persisted user-data handles and document-specific kinds
  against the [document registry](architecture.md#document-registry) and [offline inventory](architecture.md#future). The retired
  projection-backed implementation remains historical evidence. Once decided,
  align the [note model](specs/outliner/note-model.md), architecture, and links owners.
- **Overlapping server inventories.** When server discovery can expose one
  document through several servers, decide how its canonical server parent is
  selected and how aggregate membership reports duplicate, partial, or
  unavailable coverage. Preserve the [single-parent and membership distinction](specs/outliner/note-model.md#invariants),
  global document identity, and each server's authorization boundary; the
  [account hierarchy](specs/outliner/user-data.md#hierarchy) does not establish a federation or authentication protocol.
- **External sources.** Test the [adapter direction](principles.md#multi-origin-direction) against calendar entries and
  email: find, address, link, and use their context while their content remains
  in its original source. Use concrete examples to settle identity, navigation,
  availability, and kind-specific capabilities before generalizing the SDK;
  connecting a source need not convert its content into an editable RemDo
  document. One shape to check with a read-only spike: each source kind's
  adapter offers read, list, search, subscribe and invoke, shaped like MCP
  resources and tools, and a source's fields are read-only named children.
  A calendar spike fit the note contract with no new availability state: an
  unreachable source is unavailable and a removed event is known absent. It
  stood alone as its own root, so a real connector still settles identity,
  navigation, and placement under [User Data](specs/outliner/user-data.md#hierarchy), whose children and server
  shape are fixed to documents.

### Document exposure

Design the mechanism for [exposing data through another source](specs/access/access-control.md#sources): a proxy
note in shared document B showing part of private document A, an aggregate over
A's notes, or a public profile built as an ordinary public document. Research on
2026-10-30 found that only source-authorized designs deliver this; references
checked against the viewer's own access, as in Notion and Confluence, cannot.
[BigQuery authorized views](https://docs.cloud.google.com/bigquery/docs/authorized-views) are the closest precedent.

- **Direction.** The exposing source's owner creates an exposure record, stored
  in the document registry and scoped to a note or subtree of it for one
  receiving source. Any source can expose data, including an account root. A
  proxy note stores only the record's identity.
- **Reads.** Each read checks the viewer against the receiving document and
  rechecks the record, including that its grantor still owns the exposing
  source. The server resolves a read-only projection from the record; no path
  accepts a client-supplied exposing note. Proxied content never enters the
  receiving document's Yjs state, where it would outlive revocation.
- **Derived data.** MCP, search, and aggregates read through the record and only
  over its scope. Titles, parents, counts, backlinks, and search hits of
  unexposed notes stay hidden. Revocation stops future reads, not existing
  copies, and the specification states this.
- **Open.** Proxy note design, live versus pinned content, audience choice per
  proxy, consent when the two documents have different owners, identities for
  exposed notes, moves out of the scope, whether a read reports that it resolved
  through the record rather than the viewer's own access, and
  [public audiences](specs/access/access-control.md#future).

### Text format migration

Goal: every user's notes are documents in the [RemDo text format](format.md), kept in
[workspaces](specs/workspaces/store.md) with their history. People edit them live in the editor, and agents
and integrations change them as text through [note operations](specs/outliner/note-operations.md). Moving existing
editor documents loses nothing, and afterwards nothing reads editor documents.

The work lands on the integration branch `feat/text-format`, since `main`
deploys to production:

- Topic branches merge into it through pull requests, and CI runs on those and
  on pushes to it.
- Each step deletes the editor-document code, tests and specification wording
  it replaces; only the migration reads editor documents.
- `main` takes dependency updates and fixes, merged into the branch regularly;
  editor work there pauses.
- [test.remdo.com](guides/production-deployment.md#deploy-to-the-test-sandbox) previews the branch. Migration rehearsals run there on a
  copy of production data, which only people cleared to see users' notes may
  access, and the sandbox is reset afterwards.
- A behavior-preserving step changes only tests or only production code.
  Mechanical changes, scripted with the command in the pull request, stay apart
  from logic changes.

Open decisions:

1. Late offline clients: merge their edits through the text door during a grace
   period, which keeps the old decoder and transport until it ends, or require a
   sync before cutover.
2. Cut over on the shipped V2 binding with its move limit, or wait for `@lexical/y`.
3. Whether cutover requires a rehearsal on a fresh production copy that reports
   no failures.
4. The point after which cutover problems are fixed forward rather than rolled back.
5. Whether changing the MCP surface for everyone waits for the
   [Claude directory review](#claude-mcp-save-a-conversation-to-remdo) or accepts a re-review.

Steps, in order, one pull request in review at a time:

1. **Outline note operations.** Python note operations and MCP tools for
   outline notes and bodies, starting with Set text and Ensure ID. A document
   with an ID reads by its ID reference once expected versions accept one.
   Each note resolves its own children and names the kinds it holds, and each
   kind class registers itself. Operations change documents through their
   [tree](architecture.md#workspace-document-state), starting with closed
   ones, and saves and operations share one [writer](architecture.md#outline-tree).
2. **Test reader and matcher.** Close the reader and matcher gaps of *Tests
   on editor documents*.
3. **Decoder freeze.** Copy the code that reads list-level types, the body
   wrapper and the legacy marker fallback into the migration's exporter
   unchanged, run it on a production copy on test.remdo.com, and report what
   each document would lose.
4. **Tests on test documents.** Script editor tests off IDs taken from note
   text, one area at a time, then start every editor test from a
   [test document](specs/testing/test-documents.md) and compare with `toMatchDocument`. Browser and
   collaboration fixtures load through Python's reader and Node's tree. Delete
   `toMatchOutline`, the fixture builder and the fixture rules editor
   documents need. A trial run failed 474 of 853 editor tests, about 250 on
   text-derived IDs; body and marker differences move with the production
   steps that fix them.
5. **Gestures.** Gestures place, convert and check notes by [list types](specs/outliner/list-types.md),
   and list-level types and the legacy marker fallback go.
6. **Blocks and bodies.** Headings, `block` lines and bodies become Markdown
   source lines without the body wrapper, and links keep every target as
   written. Decide whether bodies render when not being edited; the
   [note body](specs/outliner/body.md) shows them as written. The editor keeps a note's name in its
   text, with any escape that stops text from reading as a name, so
   `foo:: x` names and `foo\:: x` stays literal.
7. **Editable workspace outline.** A workspace's document opens in the
   editor, replacing the read-only outline, its text box and editor documents
   in the UI. Its breadcrumb reads Home, then the workspace's name.
8. **Editor actions as note operations.** The open document's semantic
   operations move into note operations, leaving the open document as the
   editor session; consider the [note range](specs/outliner/selection.md#note-ranges) as the operand of Move and
   Delete. Operation cases are written once, as text before, operations, and
   text after or the refusal, run on Python and a few on each other surface;
   add that rule to the [testing policy](dev/testing.md) once it has worked. Each editor
   action changes the document as some sequence of note operations would, and
   a document edits and saves stably through the randomized test and a real
   process kill.
9. **Note layer.** `resolve(uri)` for `note:` across workspaces,
   [`/n/` URLs](specs/outliner/note-ids.md#ids-in-workspaces) for workspaces and notes, then [search](specs/outliner/search.md#future) across the account's
   workspaces.
10. **Sharing.** [Workspace members](specs/access/access-control.md#future), shared on Home as editor documents are.
11. **Live safety.**
    [Note operations on open rooms and stale clients](architecture.md#workspace-document-state),
    and late offline clients by decision 1. Two editors and an agent then work together
    with no silent loss beyond the move limit.
12. **Migration.** Reassess rich body paragraphs and count sharing combinations
    first. Convert user by user, moving a document only when export, read-back
    and tree comparison pass, and reporting the rest; a rerun moves only what is
    left. Rehearse on test.remdo.com until a run reports no failures.
    - Each editor document becomes its own workspace's `README.md`, with its
      owner, and its grants as members.
    - Links between editor documents become `note:` references across workspaces.
    - Old note IDs stay as cache IDs, referenced ones are promoted to `id::`,
      fold state is reapplied, and old `/n/` URLs redirect.
    - History starts with one import revision per workspace, and undo resets.
13. **Cleanup.** Remove `DocumentContent`, `DocumentGrant`, per-call headless
    editors, old routes and the experimental flag from everything but the
    migration. Give the remaining kinds, such as account roots and user-data
    notes, note operations or retire them; drop editor documents from the sources
    and their sharing rules; rename what remains of the open document to the
    editor session. Update the published OpenAI plugin and any pending directory
    review as the MCP change needs, and remove the [format](format.md)'s note on existing
    documents.
14. **Cutover.** Stop writes and back up production, then merge the branch into
    `main`, which deploys it and runs the migration. Check its report before
    writes reopen. Keep editor documents' tables through any grace period
    of decision 1, then remove them with the migration.
15. **Tracking cleanup.** Fold into their owners or remove what this migration
    made obsolete in this record, the [legacy backlog](legacy-backlog.md) and the format's
    Follow-up, then delete this section.

Gaps:

- **Per-note markers and checkboxes.** [List types](specs/outliner/list-types.md)
  gives each note its own marker and checkbox. The editor stores and shows
  them, but its gestures still change a list's type on the list, unchecking
  removes a box outside a check list instead of leaving it open, and notes
  don't take their marker and checkbox by
  [placement](specs/outliner/list-types.md#placement). The gestures step closes this, including Insertion's appended
  notes and the menu's checkbox action. They
  must not produce a note under a body line, a heading under a list item, or a
  note right after a heading at that heading's level.
- **Tests on editor documents.** Until editor documents go:
  - fixtures load into them, reading an all-checkbox bulleted list as a check
    list and a `note:<workspaceId>_<id>` link as another editor document, and
    giving a note without an `id::` line its text as its ID when that is a
    valid ID no `id::` line or earlier note claims, otherwise an ID generated
    the same way on every read;
  - `toMatchOutline` compares text, checked state, stated IDs, bodies and fold
    state, but not markers or open boxes.

  The test-document reader doesn't yet read headings, which no editor test
  states before the gestures step.
- **Read-only workspace outline.** A workspace's Document opens as a read-only
  outline, with its Markdown text box as a second view. The outline shows a file
  change made while it's open only once a client saves or the room reloads,
  since a reader never saves; editing the outline and agent edits through the
  room's tree close this. A reader still writes once: when a peer empties the
  document, Lexical's Yjs binding adds an empty root paragraph to the room.
  Reading the tree skips it, so the file is unaffected, but the room then holds
  a node no file line gives.
- **Links in workspace documents.** The editor's external-link handling unwraps
  every link whose target isn't http(s), so an editable workspace outline that
  mounts it would strip `file:`, relative and `note:` links from the file.
- **Refused workspace saves out of sight.** A workspace room whose save is
  [refused](architecture.md#workspace-document-state) tells none of its
  clients, and a refused load leaves the client reconnecting, reported again
  each time. The read-only outline shows neither; the editable outline shows
  both.
- **Body text that reads as structure.** A body is written as stored, so body
  text that would read as structure where it sits becomes structure on the next
  read: a line `- x`, a `---` under a paragraph, or an indented first line
  after a list item. Python's reader never produces such a body; the editor
  and tools can. Decide before the editor opens a workspace's Document whether
  the editor escapes such text or accepts it as Markdown it typed.
- **Unchecked block editing.** Rendered blocks were spiked only in Chromium on
  a small page: clicking a table puts the caret at the end of its source,
  dragging across a block fails, and switching shifts layout. Paste, `Enter`
  inside a fence or table, IME, find in page, screen readers, Firefox, Safari
  and mobile are unchecked.
- **Typing lost to a stale save.** When a workspace's file changes while its
  room is open, the room's next save applies the file, discarding what was
  typed since its last save. Live safety closes this.
- **Stale versions refuse agents.** Per-file versions refuse an agent's call
  whenever someone saved the same document since its read; live safety's
  open-room operations reduce that.
- **Cache IDs through recovery.** [Workspace document state](architecture.md#workspace-document-state)
  recovers from a changed file by applying its tree, which holds no cache IDs.
  [Apply](architecture.md#outline-tree) keeps a note whose text is unchanged
  among its siblings, but a note the file edits or moves to another parent is
  recreated, losing its fold state and its cache ID, which its zoom URL holds
  when it has no `id::`. A spike measured 29% of cache IDs lost after 20 edits.
  Note operations lose them the same way until the outline note operations
  step; edits made outside RemDo keep losing them.
- **Note operations on files.** [Note operations](architecture.md#workspace-document-state)
  edit a workspace document's file lines rather than its last saved tree, so:
  - a closed document's cache row takes the change by applying the file's
    tree, losing cache IDs as *Cache IDs through recovery* describes, and an
    open room takes it only at its next save, discarding what was typed since;
  - Ensure ID writes a fresh ID rather than
    [the note's cache ID](specs/outliner/note-ids.md#ids-in-workspaces);
  - temporary references are positions, valid only while the document is
    unchanged;
  - Set text writes an outline note as given rather than in canonical spelling.

  A save re-spells the whole file instead of [writing](architecture.md#outline-tree)
  only its changed notes. A spike kept the saved tree with cache IDs on the
  cache row and merged changes into open rooms three ways from the state the
  room last saved; the merge base must come from the row rather than the
  hub's memory, since a lost save reply would otherwise duplicate text. It
  left open what an operation on a note that unsaved typing deleted does.
- **Note operations on unusual text.** Set text and Ensure ID change only
  their note's own lines, and refuse what that can't express: notes sharing a
  marker's line, as in `- > quote` or `- - b`, and a body whose lines hold a
  property line. Ensure ID also refuses a note whose text
  wouldn't read back with its new ID line where it puts it.
- **Changes an open head undoes.** A live document's saves that return a file
  to what the open head's parent holds leave the head with a change that
  changes nothing, which the [store](specs/workspaces/store.md#commits) would
  otherwise refuse. Dropping it can leave an empty revision, which the store
  can't delete on its own.
- **Moves under concurrent edits.** Under the V2 binding, an edit concurrent
  with a move can vanish or land on the wrong note. Indent needs `@lexical/y`
  and reorder its unmerged PR 9449, so don't build a fix on V2.
- **Delete beats edit.** Yjs lets a delete win silently over a concurrent edit,
  so it needs detection.
- **Invalid trees under concurrency.** A few concurrent test runs left invalid
  trees that normalization didn't repair.

After cutover:

- Show same-word and delete-versus-edit conflicts to the user.
- Agent change review: a note-level diff with per-hunk revert.
- Backlinks, run on the server.
- `useNote(ref)` for UI that reads notes outside the open document, holding
  reads in TanStack Query keyed by reference. The SDK reads every kind from
  Django over REST and stays current through the change stream, outline notes as
  of their last save.
- Give the Python account root the [user-data hierarchy](specs/outliner/user-data.md#hierarchy), replacing the SDK's
  `user-data`, `document-source` and `collection` kinds; the SDK becomes a REST
  client plus the editor session, and code names for user-data's servers stop
  saying "source". Decide whether the account root lists workspaces per server.
- **Early editor operations.** Revisit the editor's structural operations against
  [note operations](specs/outliner/note-operations.md) and adjust those that
  diverge.
- Move to `@lexical/y`, reseeding documents from text, once `@y/y` is final or
  its update corruption bug is fixed, `@lexical/y` ships in a Lexical release,
  reorder preservation lands (unmerged PR 9449), Hocuspocus supports Yjs 14 or a
  tested alias covers packaging, Redis and auth, and RemDo's collaboration suite
  and the randomized test pass.

### Post-Hocuspocus simplification proposals

Proposals from a read-only assessment of what the Hocuspocus migration leaves
over-general, given a full data reset with no migration or backward-compatibility
obligation. Each was filtered by whether it would exist in a from-scratch
Hocuspocus and Django design. They are candidates, not accepted work; resolve
each against its current owner before acting, and remove entries that assessment
rejects. Evidence and the rejected alternatives are recorded in
`.agent/post-ysweet-simplifications.md`.

Code items assume no contract change:

1. **Provider adapter.** The neutral provider-event vocabulary abstracts over
   a single provider. Narrow it only where the resulting bridge is clearer;
   preserve acknowledgement tracking and independent cache/network lifetimes.
2. **Single-source document residue.** Production supplies exactly one hard-coded
   document source, leaving statically false branches in the toolbar's label
   qualification, the source-local action split, and the workspace source
   lookup. Removing the dead branches is independent of the visible grouping in
   the Current Server decision below.
3. **Duplicated server contract types.** The hand-written user-document and
   document-access interfaces mirror serializers that the generated API schema
   already describes, following the precedent already used for the current-user
   payload. Aligning optionality removes a hand-maintained drift risk.
4. **Test-only flexibility in product code.** The collection-source input
   normalization exists so tests can pass plain arrays; production always passes
   a live source.
5. **Repeated internal-service constants and helpers.** The container port pair
   is hard-coded in three places after its configuration helper lost its
   Y-Sweet job; three credential-injecting WebSocket subclasses differ only by
   header; and an origin-printing script spawns a runtime to echo a value its
   caller already exports.

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
2. **Current Server grouping.** Collapsing the remaining server abstraction
   depends on whether [Home](specs/outliner/home.md) keeps a visible server
   grouping and its current-server document action. Decide Home's shape first;
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

- **Large-scope documentation alignment.** Evaluate the structured finding
  schema and parallel specialist-reviewer layout from the Upkeep skill
  (wei18/Upkeep) as a way to speed alignment over large scopes.

- **Format levels and repository Markdown.** Separate in the
  [text format](format.md) what RemDo reads (every CommonMark and GFM file),
  the [canonical spelling](format.md#canonical-spelling) tools write, and
  authoring guidelines for structure. Then align the repository's Markdown and
  its lint with the canonical spelling, including the format's lint follow-up.

- **Skill-prose pressure testing.** Evaluate superpowers `writing-skills`
  adversarial subagent trials as an additional check for skill-file prose.

### Performance

- **Client performance contract.** Turn the [interaction and discovery principles](principles.md#interaction-and-discovery)
  into measurable targets and evidence, including editing responsiveness,
  search opening, and query updates across representative document sizes and
  devices. Assess CPU and memory costs alongside user-visible latency. Reassess
  the existing non-collaboration Vitest benchmark's workloads, operations,
  metric, and runner, then establish a specification and align or replace the
  harness. Use the evidence to select bounded optimizations rather than
  presupposing an index, worker, or library.

  Include [addressed-note resolution](../src/client/editor/outline/note-traversal.ts), index maintenance after edits, and
  value/subtree reads as separate workloads. The shared-locator follow-up
  remains tracked at that implementation; distinguish loaded lookup from cold
  document acquisition.

- **Server capacity under load.** Measure a production image under a burst of
  concurrent [MCP](specs/integrations/mcp.md) saves alongside simulated editors:
  peak memory per process, CPU, and save latency across document sizes. Use the
  results to size the hosted instance and to decide whether to reduce
  whole-document saves, cache open documents in the headless host, split the
  collaboration hub, or deploy headless editor work separately from the hub.
  Measure cold reads and Yjs/Lexical hydration separately from note resolution
  and output serialization.

  Include concurrent sign-in, document saves, and authorize calls. Under ASGI,
  Django runs synchronous views one at a time on a single thread: four 0.4 s
  requests took 1.6 s, against 0.4 s unserialized, and the former gunicorn
  server ran four threads. This also serializes the collaboration host's
  authorization and storage callbacks; MCP database calls run on separate
  threads and are exempt.

### Operations

- **Expired Django sessions after integration.** Define how supported
  deployments invoke Django's existing expired-session cleanup. Reuse framework
  maintenance without introducing a general worker or scheduler architecture for
  this task.

- **Durable collaboration acknowledgements.** [Synced](architecture.md#hydration-vs-sync) currently acknowledges
  receipt in the collaboration server before SQL persistence. The accepted crash
  window can lose acknowledged edits and grows during database outages. Design
  durable-save acknowledgements and their browser/logout semantics when stronger
  guarantees are required; headless hosts already report writes complete only
  after a committed persistence barrier.

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

- **Progress during pending app reviews.** The ChatGPT plugin (submitted
  2026-10-12) is approved and published, as the developer reported on
  2026-11-04. The Claude.ai submission (2026-09-28) still awaits review, with no
  known completion date. Protect both queue positions and reviewer workflows
  while continuing independently useful SDK development, compatible fixes,
  tests, and research. Split new SDK capabilities from their MCP exposure;
  postpone only the parts that could disturb a pending review and keep them in
  the relevant follow-up. Uncertainty about those parts does not pause
  independent work.

  While a review is pending, preserve its submitted MCP endpoint and
  authentication, tool names/schemas/descriptions/annotations, result/error
  behavior, and listing/package/review materials. Before changing a submitted
  artifact or deploying a change that could affect review, establish the
  submitted baseline and check current provider requirements; defer the
  affected part when its impact remains uncertain.
  [Production deploys from `main` after CI](guides/production-deployment.md#deploy-on-render), so assess review impact before
  merging affected changes. OpenAI's [review requirements](https://developers.openai.com/plugins/deploy/app-review)
  allow server-only changes that preserve the published contract; they do not
  establish either pending submission's queue status. Do not withdraw or
  resubmit a pending application.
  Revisit each platform's constraint when its review finishes or the developer
  changes this direction.
- **Submission baseline.** Obtain saved submission-time tool definitions and
  detailed OAuth configuration for both platforms where available, so a later
  change is compared with what was submitted rather than with the repository's
  [compatibility reference](#temporary-mcp-compatibility-guards). Assistant
  tool-selection cases remain live client checks.

- Let the [MCP server](specs/integrations/mcp.md) set a note's content text
  and delete a note, which first need [open document](specs/outliner/open-document.md)
  operations addressing a note. Appending cannot add a body, although reading
  returns bodies. For documents in workspaces, [note operations](specs/outliner/note-operations.md)
  cover this in the [text format migration](#text-format-migration)'s outline note operations step.
- Expose [cross-document search](#cross-source-discovery) once server-side search spans a user's documents;
  searching a single document adds little over reading it whole.
- **Oversized upload regression coverage.** Django closing the connection before
  reading an over-limit body used to crash the Node writer. The fix in
  `src/platform/net/django-request.ts` was confirmed only against gunicorn;
  add deterministic coverage against the current ASGI service. Fakes and the
  Docker E2E path did not reproduce the original crash deterministically.
- **Very deep appends.** Remove stack-depth dependence from append validation
  and Lexical/Yjs synchronization. A 1,000-note chain exceeds the existing Node
  validator's stack; bypassing that validator also overflows Lexical/Yjs. The
  Python transport must preserve already-working depths without adding its own
  lower limit. The developer approved, on 2026-10-25, a temporary patch of the
  MCP SDK's JSON decoder in `backend/mcp_server/server.py`, whose parser stops
  near 100 nested notes. Remove it when its focused regression passes without
  it, for example after an upstream fix.

#### Temporary MCP compatibility guards

Under the [pending-review constraint](#claude-mcp-save-a-conversation-to-remdo), run the package and endpoint checks before
changing the MCP implementation:

```sh
pnpm run test:unit plugins/openai/package.spec.ts
pnpm run test:collab tests/unit/collab/mcp-contract.collab.spec.ts tests/unit/collab/mcp.collab.spec.ts
```

The [package baseline](../plugins/openai/submitted-package-baseline.json) freezes the verified OpenAI 0.1.1 payload by file name and
content hash, including the shared icon. Tests build temporary copies and
compare their extracted contents; they neither retain nor require the submitted
ZIP, and ZIP compression and member order do not affect the comparison.

The [runtime reference](../tests/fixtures/mcp/compatibility.json) records complete `initialize` and `tools/list` results
from its identified repository revision. It is not an exported submission-time
scan. HTTP assertions normalize only the fixture origin and preserve extension
fields that client SDK parsing could omit. The [workflow checks](../tests/unit/collab/mcp.collab.spec.ts) normalize generated
note IDs while preserving document identity and result text. The
[collaboration harness](specs/testing/test-harness.md#collaboration-tests) starts the current implementation. MCP assertions use
HTTP; account, persisted-state,
and concurrent-peer fixtures still use Django and Yjs.

After the pending-review compatibility freeze, remove the former Node MCP
token-probe route `/api/mcp/current-user` and retarget its tests. Python MCP
resolves credentials in-process; retain the existing public route during review.

Expected baselines are reviewed data, independent of the implementation being
tested. A failure requires assessing the public change under the pending-review
constraint; regenerating expectations does not establish compatibility. The
[live client walkthrough](specs/integrations/openai-plugin.md#review-walkthrough) separately checks assistant tool selection.

These cross-file guards are marked `Temporary compatibility freeze` at their
assertions. Review and migration completion trigger reassessment, not automatic
removal; an accepted interface change must still respect every pending review.

- **Submitted package.** When OpenAI 0.1.1 is no longer the protected submission
  and its replacement is accepted, retire or replace the [package hash assertion](../plugins/openai/package.spec.ts)
  and [baseline](../plugins/openai/submitted-package-baseline.json) together. Keep general package-builder coverage.
- **MCP interface.** After the pending reviews and backend migration, reassess
  the exact descriptor snapshot, error wording and stateless-transport
  assertions in the [HTTP checks](../tests/unit/collab/mcp-contract.collab.spec.ts). Retire obsolete literal comparisons and their
  [runtime reference](../tests/fixtures/mcp/compatibility.json) together, or update expectations for an accepted interface
  change; keep semantic protocol, authorization, access and persistence coverage.
- **Workflow accounts.** When the workflow checks are no longer frozen, replace
  their fixed-address accounts, including `mcp-owner@example.test`, with the
  isolated [account fixture](../tests/_support/account-fixture.ts) owner, recipient, and private document in the
  unshared-document check.
- **Cleanup.** Remove retired assertions' imports, fixture-only setup and local
  markers, and remove this section when no temporary guards remain. Keep
  semantic regression coverage; preserve provenance in Git history.

### Landing redesign

The public pages, the app shell, the shared header and footer, the document
page, Home, the menus, and the dialogs follow the
[final Figma design](https://www.figma.com/design/doTT65AwFC2WqcvUBh1Tjn/).
Remaining:

- **Editor surface.** Restyle the search results and the sync, touch, and
  collaboration states. Decide what the frames leave open: the
  [location header](specs/outliner/location-header.md) requires a visible
  document heading that the outline frame omits, bold top-level notes and a
  "Press Shift twice for note actions" hint appear only in the mock, and
  Favorites and Recents groups have no product behind them.
- **Team section.** The Figma Team section moves to the About page, where its
  bios are reconciled with the current team list.
- **App header links appear on hydration.** Rendering About on the server
  would end the pop-in but changes the [connection-unavailable
  state](architecture.md#shared-presentation), which hides the header links.


### Delegated access

- **Limit connected apps.** Let users limit what connected apps can access, for
  example per document from the share dialog. Until then, a connected app can
  use every operation the [MCP server](specs/integrations/mcp.md) exposes,
  including deleting notes once that is exposed.

### SDK

- **Shared note implementation.** The non-editor kinds use the
  [shared note implementation](dev/sdk.md#note-kinds); editor notes stay with their adapter.
  Avoid a runtime descriptor framework and a generic property API; add untyped
  properties only if user-defined types become a product feature.

- **Non-editor sources.** [Account roots](specs/outliner/note-model.md#definitions) keep their `user-data`
  kind, and no consumer reads ownership yet. Use the [external-source examples](#cross-source-discovery) to
  test the same role for a scope such as a mailbox or calendar. Settle which
  account root owns an aggregate across servers, and the owner under the
  [no-login mode](specs/access/access-control.md#future). Additional runtime kinds remain undecided.

- **SDK API validation.** Evaluate query and app-resource reads in their own
  workflows, including Home and Sharing, using the [design principles and references](dev/sdk.md);
  the cache library does not settle the public SDK shape.

  Keep model and API choices open to revision throughout this SDK initiative.
  Revisit them when consumer evidence reveals friction or a better fit, and
  update the design guidance, affected behavior owners, and executable showcases
  ([editor](../src/note-sdk/note-sdk-showcase.spec.ts), [account](../tests/unit/collab/note-sdk-showcase.collab.spec.ts)) with each
  changed decision. Before closing the SDK work, reconcile those artifacts with
  the final choices and explicitly track any remaining gaps.
  Add external-source and saved-filter consumer examples when real host support
  exists.

- **Note-centered SDK consumer boundary.** The
  [open document](specs/outliner/open-document.md) now owns the first
  settled slice around the shared [note model](specs/outliner/note-model.md):
  addressed-note access and observation, observable action capabilities, and
  semantic operations. [Search](specs/outliner/search.md) requests results through
  the open document. The [mobile toolbar](specs/outliner/mobile-toolbar.md) and [quick action menu](specs/outliner/menu.md) consume its
  capabilities and operations; editor bindings resolve menu targets to stable
  note identity.

  Use real consumers, including keymaps, to improve the SDK, not merely to
  migrate calls behind its existing API. Data access, queries, and observation
  are equally valid starting points when a consumer exposes a more important
  gap. Choose small slices by
  consumer value rather than a fixed PR sequence, following the
  [consumer API principles](principles.md#consumer-apis) and the open
  document's ownership boundaries. Preserve each operation's owning behavior
  while reconsidering the SDK shape.

  Keep resource reads aligned with the [document registry](architecture.md#document-registry) and choose tools
  against a concrete consumer and the [performance work](#performance). Coordinate
  resource-read changes with the [offline document-inventory follow-up](architecture.md#future), and
  non-current-document access and
  cross-document query/loading with the
  [cross-source discovery work](#cross-source-discovery).

  Success is a simple SDK surface for note access, observation, queries, and
  operations without adapter-specific semantic logic in consumers. Keep
  capabilities at their natural scope rather than forcing every operation onto
  one note. Do not preselect a generic action registry, flat API, final SDK or
  package name, plugin contribution framework, or second-adapter implementation.

  At the start and close of each slice, locate related entries across
  the [tracking record](#remdo-todo), the
  [legacy backlog](legacy-backlog.md), and relevant Git history. Treat them as
  informative evidence rather than requirements or a predetermined API, then
  migrate, rewrite, or remove them according to current owners and what remains
  useful.

### Outliner

- **Emoji replacement corrupts text.** Replacing 😀 with 😁 saves corrupted text
  to Yjs, because `simpleDiffWithCursor` in `@lexical/yjs` splits a surrogate
  pair. It was reproduced headlessly, not yet in a browser.

- **Touch and menu entry for note bodies.** [Body](specs/outliner/body.md#core-behavior)
  creation is reachable only through `Shift+Enter`, so touch devices cannot add
  a body at all, and iOS hardware keyboards can report `Enter` as
  `Shift+Enter` when auto-capitalization fires. Add an add/focus-body action to
  the [note menu](specs/outliner/menu.md) and the
  [mobile toolbar](specs/outliner/mobile-toolbar.md#actions) with the same
  add-or-focus semantics as the key gesture, and cover both surfaces.

- **Keyboard reference binding coverage.** The
  [keyboard reference](specs/outliner/keyboard-reference.md) is checked against
  the editor only for toggle checked and move up/down, whose chords it shares
  with the keymap. Cover the remaining entries, Lexical's built-in editing
  bindings and the other owners' keys, with checks that press what the
  reference shows.

- **Document import completion.** After applying an uploaded state,
  `PendingDocumentImportPlugin` waits for an editor update from note-ID
  normalization. A normalization that changes nothing commits no update, so for
  an export whose notes already carry IDs the wait does not settle and the
  following `session.awaitSynced()` never runs. Decide whether a successful
  import means the state is applied or synced, then wait on that signal. The
  `document-imported` analytics event currently fires once the state is applied.

### UX direction

These proposals guide the next UX slices; unresolved choices remain proposals
until accepted in their behavioral owners. Defer a command palette and action
menus on every breadcrumb until improving the existing surfaces leaves a
concrete unmet need.

- **Toolbar presentation preference.** Offer a mutually exclusive choice
  between the default [desktop toolbar](specs/outliner/desktop-toolbar.md) and the
  [floating formatting toolbar](specs/outliner/inline-formatting.md#floating-presence-and-placement).
  Reassess the retained floating presentation in that follow-up; formatting
  commands and keyboard shortcuts remain independent of the chosen surface.

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

- **Link sharing.** Bearer-link issuance, resolution, regeneration, revocation,
  and invalid-link behavior are unbuilt. Define their behavior in
  [Access Scope](specs/access/access-control.md#access-scope) before implementing them. Direct-grant revocation is
  also unbuilt; consider it when extending sharing management.

- **Document deletion in open sessions.** [Document deletion](specs/access/access-control.md#document-deletion) ships from
  Home row menus and the document-root header menu, and the deleting session
  leaves for Home without the deletion notice, but other sessions do not learn
  of it as specified. Django
  notifies the collaboration hub only of document-list changes; the hub closes
  a deleted document's connections only when its next store fails, and hub
  authorization maps a missing document to the same denial as refused access.
  An open editor
  therefore shows a connection error instead of leaving for Home, which has no
  notice surface. Devices keep their encrypted local copy, since local
  persistence has no per-document purge.

- **Contextual menus across desktop and touch.** Keep the [note menu](specs/outliner/menu.md) available
  on both, with discoverable keyboard entry and an easily reachable More action.
  Let the [touch toolbar](specs/outliner/mobile-toolbar.md) accelerate frequent editing actions; reassess whether
  reaching its menu should require horizontal scrolling. Align action names,
  availability, selection targets, and focus restoration across surfaces,
  following the [SDK capability work](#sdk) without adding a generic command system.

- **Home and document switching.** Undecided: recalling the previous document,
  which needs recency state, and a handoff from empty note search to document
  search.

### Agents

- **Post-skill retrospectives.** Make an on-demand retrospective available
  after skill runs, using saved session logs to explain elapsed time, repeated
  or costly work, and concrete lessons. Add dedicated orchestration or
  instrumentation only if real retrospectives show that the existing evidence
  is insufficient.

### Tooling

- **Media uploads.** Add upload tooling for [recordings](specs/demo/demo-video.md), likely reusing `remdo-share`.

- **Development setup and workflow.** Allow per-checkout backend settings
  overrides and reduce setup and launcher complexity in [local development](guides/local-development.md).
  Preserve independent instances and Node-independent backend commands; reassess
  mechanisms when resuming.

- **Upstream ast-grep project-config validation.** Contribute upstream support
  for rejecting unknown project-config keys or shipping version-matched schemas
  with `@ast-grep/cli`, then replace the repository-owned config validator with
  that upstream mechanism.
