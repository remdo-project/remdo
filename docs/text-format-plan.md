# Text format adoption plan

Informative temporary ledger for adopting the [RemDo text format](format.md).
Current specifications stay authoritative until each stage moves its contract.
Remove this file when migration finishes.

The plan covers single-file workspaces through the migration of every editor
document. Multi-file workspaces, the Git connector and external sources need
[later plans](#later-plans).

The plan finishes its migrations: anything predating it that has a simpler or
more consistent form on its mechanisms moves to them, or is deleted, rather
than living beside them. What is too large to move at once is listed under
Cleanup with its reason.

New documents use this design behind an experimental flag, a Django permission
that administrators grant, so each stage can merge to `main` without affecting
existing documents. Users without the flag, including directory reviewers, see
Home and the submitted [MCP surface](todo.md#temporary-mcp-compatibility-guards)
unchanged.

## Design

### Workspaces

- A workspace holds one document, `README.md`, so Git hosts show it on a
  repository's front page. A missing `README.md` reads as an empty document
  and the first save creates it, so creating a workspace writes no file.
- The UI shows a workspace and its document as one: Home lists the workspace,
  opening it opens the document, and breadcrumbs read Home and then the
  workspace's name. Renaming changes the workspace's name, never the file's.
- Permissions belong to the workspace: an owner and members with full access.
  Accounts have no personal workspace.
- Each editor document migrates to its own workspace, keeping its owner and
  turning its grants into members, so access never widens.

### Storage

- A workspace's files and their history live in the database, Postgres in
  production and SQLite locally, and that content is the source of truth.
  The store holds any kind of file as bytes.
- One database backup covers everything while file content stays in the
  database.
- History uses three tables: `blob` holds content keyed by hash, `revision`
  holds the workspace, parent, author, time and message, and `revision_change`
  holds the paths each revision added, changed or deleted. `workspace_file`
  holds current state, so only history views replay changes.
- The [workspace store](specs/workspaces/store.md) owns the file, path, commit
  and read rules.
- Each document's cache row holds its cache ID, path, generation, Yjs state,
  saved text and hash. A save writes text and Yjs state in one transaction.
- A hash mismatch runs the external-edit sync. Rebuilding Yjs state from text is
  rare recovery, because it can duplicate or strand offline work.
- Each Yjs lineage has a generation ID. A stale client never syncs Yjs state:
  its last synced text goes through a three-way merge.
- Saves follow edits going quiet. Revisions are batched per session or idle
  period, and each text-door edit gets its own revision and author.
- If Yjs write volume inflates the change log, Yjs state can move to disk. Saves
  then write text first and recover through the hash check.

### Storage alternatives

- Repositories on disk need two systems backed up consistently.
- Git objects inside Postgres exist only as experimental libgit2 backends that
  need a custom extension.
- Doltgres and Lix version data out of the box but are young. Revisit them if
  the history tables grow beyond this design.

### Search

- Search reads documents with the same Python reader as note operations, so
  search and note operations read documents the same way, and every query
  filters by workspace access.
- It scans documents first. An index waits until scanning is too slow: Postgres
  full-text search in the `simple` configuration plus `pg_trgm`, and FTS5 on
  SQLite.

### Writers

- Django is the one writer per workspace. It owns the workspace tables, MCP,
  revisions and saves.
- The live door is the browser through Yjs. The text door is MCP and any API.
- Every note kind lives in Python, in the module that holds its data:
  `backend/workspaces` for workspaces, documents, outline notes and Markdown
  blocks. `backend/notes` holds what sources share, the account root, and the
  one entry point that reads notes and applies calls for MCP, the REST API and
  integrations.
- Python owns the text format's reader and its only writer, on `markdown-it-py`.
  It matched the JavaScript `markdown-it` on 714 inputs, structure and line
  spans included. A JavaScript reader remains for paste and test fixtures.
- Node shrinks to the Yjs relay and converts Yjs to and from a JSON outline
  tree; it never writes Markdown. The tree holds notes with their markers and
  checked state, headings, bodies, inline runs, dates and links, with anything
  else as verbatim source, and each note's cache ID. Three calls carry it: save
  to a tree, apply a tree to live Yjs by cache ID, and read the live tree.
  Retiring Node later means replacing the relay.
- The cache row keeps each document's last-saved tree, so the writer keeps
  untouched text byte-identical.
- The editor runs note operations for the person typing; Python runs them for
  everyone else. Shared cases check that both give the same result.
- The browser's SDK keeps its note API, observation included. Every kind reads
  from Django over REST and stays current through a change stream, outline
  notes as of their last save; only the editor's text is live through Yjs. The
  SDK sends operations and shows results, keeping typed kinds but no kind logic.
- After a call that changes notes commits, Django sends the affected accounts
  the bare notice the collaboration hub already relays for their document
  lists, and each client rereads the notes it holds, as it does after
  reconnecting. A change log with sequence numbers and replay, or notices
  naming the changed references, waits until rereading everything costs too
  much. The channel moves with the relay if Node retires.
- DRF serializers define the notes API once: OpenAPI and the generated
  TypeScript types come from them, and so do the MCP tools' input schemas.
- A closed document needs no Node: Django applies the operation, checks it and
  records a revision. The next load syncs through the hash check.
- An open document is saved first, then edited through the fork path, so online
  peers have nothing unsaved.
- [Note operations](specs/outliner/note-operations.md) own how any caller reads
  and changes notes of every kind, through the text door or the editor. They
  follow Roam's MCP write set, with Anytype's batch guards and a check of the
  whole tree.
- The open document's semantic operations move into note operations, leaving
  the open document as the live editor session: focus, selection, view, history
  and the capabilities that depend on them.

### References and notes

- Every reference is a URI, and its scheme picks how it resolves. `note:` takes
  a note ID within its workspace, or `<workspaceId>_<id>` across workspaces on
  the same server; only a full URL crosses servers. Email uses `mid:`.
- URLs are `/n/` followed by a
  [reference](specs/outliner/note-ids.md#ids-in-workspaces). Until Cleanup,
  `/n/` also serves editor documents. Workspace and editor document IDs share
  one alphabet and length, so telling them apart needs a lookup by ID.
- Every note has a cache ID in Yjs node state. A reference promotes that value
  to `id::` in the text, and text always overrides the cache.
- [Note operations](specs/outliner/note-operations.md) and
  [note IDs](specs/outliner/note-ids.md#ids-in-workspaces) own the note shape
  and resolution.
- The browser's SDK holds reads in TanStack Query keyed by reference behind
  `useNote(ref)`. Backlinks and search run on the server.

### Documents and bodies

- A body is the first run of Markdown block lines before any outline child. It
  is stored as ordinary children and behaves as its own editing region.
- Body lines start as Markdown source, rendered per line when not being edited.
  Rich paragraph lines can follow if users ask, with no text change.
- `folded` stays in Yjs node state.

## How steps land

- Each step holds one side fixed, changing only tests or only production
  code, so the unchanged side shows nothing else moved.
- Mechanical changes, scripted with the command in the pull request, stay apart
  from logic changes.
- A new path lands, callers switch, then the old path goes, each passing on its
  own; while both exist, a check shows they agree.
- A migration follows the mechanism that enables it as its own step, not inside
  the feature.

## Stages

Stages 3 and 5 can run in parallel once stage 2 lands. So can stages 4 and 6
once stage 3 lands.

1. **Foundations**, landed without search
   - Add the experimental flag, workspace record and history tables.
   - Add note operations for the account root, workspaces, folders, documents
     and files, without outline notes, through one MCP tool per operation.
     Existing tools stay for old documents.
2. **Workspaces on Home**, landed with search moved to stage 5
   - Narrow workspaces to one `README.md`: refuse any call that leaves another
     file, keeping the folder and plain-file kinds for multi-file workspaces,
     and drop the personal workspace. Insert of a workspace may come with its
     document's content.
   - Drop the history tables' unused admin permissions.
   - Add the notes REST API on the same entry points as MCP. Home lists
     workspaces in its Current Server list through the SDK, opens a workspace's
     document as plain text, and renames and deletes workspaces.
   - Send notes changes through the account's change notice, and test that Home
     catches up after the channel reconnects.
   - Exit: a flagged user creates, edits, renames and deletes workspaces on
     Home and through MCP, and Home shows an agent's changes without a reload.
3. **Editor on text**, in this order, each step one or a few PRs
   - Before changing editor internals, move editor tests onto the text format
     so the same tests check behavior before and after: first find notes by
     their text, expecting exactly one match, against today's fixtures; then
     write fixtures in the format with only the IDs tests rely on, checked
     against the JSON they replace; then expected outlines. A JavaScript reader
     in test support reads what migrated fixtures use and moves into the app
     when paste needs it; expected outlines compare as trees, so tests need no
     second writer. JSON fixtures stay for states the format can't express.
   - Add the Python reader and canonical writer, with write-time alignment to
     the saved text, and let Read list a document's outline notes and blocks.
     Test the writer on edits beside unusual Markdown, not only on text that
     round-trips unchanged.
   - Write operation cases once, as text before, operations, and text after or
     the refusal. Test them on Python's note operations, and check each other
     surface, such as MCP or the editor, with only a few of the same cases. Add
     this rule to the [testing policy](dev/testing.md) once it has worked.
   - Spike the tree: a Yjs-to-tree-to-text round trip over the fixtures and
     the corpus keeps every byte, reports what it loses, and settles the
     schema, including how editor bodies map to Markdown blocks.
   - Extend the editor schema with headings, `block` lines, per-note markers and
     independent checkboxes. Use `line` or `group` storage with no body wrapper.
   - Add Node's three calls, the cache row with the last-saved tree, the
     one-transaction save and hash recovery.
   - Add cache IDs on RemDo's own node state, with three sync steps: transfer to
     a recreated identical note, repair duplicates, and clear a holder when a
     text `id::` claims its value.
   - Update note content by splicing text, never `clear()` plus `append()`.
   - Open a workspace's document in the editor instead of as plain text, the
     first change people see. It comes before outline note operations, which
     would otherwise give the editor an independent reference, so integration
     problems surface early.
   - Add Python note operations for outline notes and Markdown blocks, and
     their MCP tools, starting with Set text and Ensure ID. Let each note
     resolve its own children and name the kinds it holds, instead of deciding
     kinds from paths, and let each kind class register itself.
   - Move the open document's semantic operations into note operations, as a
     complete contract migration once the pending MCP reviews allow it.
     Consider the [note range](specs/outliner/selection.md#note-ranges) as the
     operand of Move and Delete.
   - Test that each editor action changes the document as some sequence of
     note operations would.
   - Exit: a flagged document edits and saves byte-stably in the real editor,
     passing the randomized test and a real process kill, and an agent changes
     it through note operations without disturbing other notes or IDs.
4. **Live safety**
   - Add the text door for open documents and generation IDs.
   - Keep each client's last synced text, and add the stale-client merge.
   - Show same-word and delete-versus-edit conflicts to the user.
   - Add agent change review: a note-level diff with per-hunk revert.
   - Exit: two editors and an agent work together with no silent loss outside
     the known move limit.
5. **Note layer**
   - Add `resolve(uri)` for `note:` across workspaces and the new URL routes.
   - Add `useNote` and backlinks.
   - Add search across the account's workspaces, for Home and MCP, whose
     results open the matching note.
   - Give the Python account root the
     [user-data hierarchy](specs/outliner/user-data.md#hierarchy), replacing
     the SDK's `user-data`, `document-source` and `collection` kinds; the SDK
     becomes a REST client plus the editor session, and code names for
     user-data's servers stop saying "source". Decide whether the account root
     lists workspaces per server.
   - Exit: the UI and MCP read closed documents' notes without an editor, and
     a workspace or note opens from its URL.
6. **Sharing**
   - Add workspace members, with sharing on Home as editor documents have it.
   - Exit: a flagged team shares a workspace and edits it together.
7. **Migration**
   - Reassess rich body paragraphs, since today's bodies show rich text.
   - Count sharing combinations and dry-run on a copy of production data.
   - Convert user by user: move a document only if export, read-back and tree
     comparison pass, and report failures.
   - Put each editor document in its own workspace as `README.md`, with its
     owner and its grants as members.
   - Rewrite links between editor documents as `note:` references across
     workspaces.
   - Keep every old ID as a cache ID, promote referenced ones, reapply fold
     flags and redirect old `/n/` URLs.
   - Start history with one import revision per workspace. Undo resets.
   - Keep old Yjs state read-only for a grace period. Late offline clients sync
     into it, and the server applies the difference through the text door.
   - Exit: every document has moved or is reported.
8. **Cleanup**
   - Remove `DocumentContent`, `DocumentGrant`, the body wrapper, per-call
     headless editors and old routes.
   - Before changing the MCP surface for everyone, check the published OpenAI
     plugin and any pending directory review for updates they need.
   - Move this design into its owning specifications, and remove the format's
     note on existing documents.
   - Give the remaining existing kinds, such as account roots and user data
     notes, note operations or retire them.
   - Drop editor documents from the sources and their sharing rules.
   - Rename what remains of the open document to the editor session.
   - Fold the remaining `docs/todo.md`, legacy backlog and format Follow-up
     items into their owners, then delete this plan.

## Later plans

Informative starting points for work beyond this plan.

- **Multi-file workspaces:** folders, plain files and several documents per
  workspace, a listing when `README.md` is missing, link rewriting on rename
  with a broken-link check, a `note_index` table for resolution, backlinks and
  search, and large files in an object store under the same content hash,
  versioned and pruned only after backups expire.
- **Git connector:** a workspace connects to one branch of a Git remote,
  optionally one folder of it, over plain Git. A sync fetches only that branch's
  tip, merges a moved tip through the note-level merge, and pushes new
  revisions as fast-forward commits built on the remote tip's tree. The
  connection records the remote commit the workspace is based on.
  - What RemDo doesn't hold stays in the remote untouched: history from before
    connecting, other branches and tags, and entries outside the store's rules,
    such as symlinks, file modes, submodules, oversized files, refused paths
    and anything outside the connected folder. Each push changes only the paths
    RemDo changed.
  - Many workspaces can connect to folders of one repository, and cloning a
    workspace means connecting it to an empty remote of the user's own.
  - Text a push changes skips note operations' checks; duplicate IDs it brings
    are reported, not repaired.
  - GitBook's Git Sync, Git-based content editors such as Decap CMS, TinaCMS
    and Keystatic, and Overleaf's GitHub sync keep their own store and sync one
    branch of a user's repository. Wiki.js keeps pages in a database with Git
    sync, and its two-way sync is reported as fragile.
  - Start by surveying a few dozen public vault and docs repositories for what
    the connector must leave untouched.
- **External sources:** each source kind's adapter provides `read`, `list`,
  `search`, `subscribe` and `invoke`, shaped like MCP resources and tools, and
  a source's fields are read-only named children. Check the contract with one
  read-only spike.

## Independent work

- Fix the emoji bug: replacing 😀 with 😁 saves corrupted text to Yjs, because
  `simpleDiffWithCursor` in `@lexical/yjs` splits a surrogate pair. It was
  reproduced headlessly, not yet in a browser.

## `@lexical/y` gates

Switch new documents by reseeding from text once all of these hold:

- `@y/y` is final, or its update corruption bug is fixed.
- `@lexical/y` ships in a Lexical release.
- Reorder preservation lands, currently in unmerged PR 9449.
- Hocuspocus supports Yjs 14, or a tested alias covers packaging, Redis and
  auth.
- RemDo's collaboration suite and the randomized test pass.

## Known limits

- MCP applies one operation per tool call; a batch tool waits until agents
  need several operations applied all or none.
- Per-file versions refuse an agent's call whenever someone saved the same
  document since its read; stage 4's live merge reduces that.
- Until stage 3, Read returns a document's content but not its children, nor
  whether it has any, and Insert into a document and Ensure ID are refused.
- Until stage 3, a workspace's document opens as its Markdown in a plain text
  box. Save applies Set content with the version read; a stale save keeps the
  typed text and offers to reload the current content or overwrite it. A save
  made elsewhere reloads the box when it holds no unsaved edits, and otherwise
  offers the same choice at once.
- Until stage 5, Read of the account root lists its workspaces but not its
  [user-data](specs/outliner/user-data.md#hierarchy) collections, and an open
  workspace has no URL: a reload returns to Home.
- With both tool families visible, agents asked about "workspace" documents may
  still pick the editor-document tools. Revisit the descriptions before
  widening the flag beyond testers.

- An edit concurrent with a move can vanish or land on the wrong note. Indent
  needs `@lexical/y`, and reorder needs the unmerged PR. Don't build this on V2.
- Delete beats edit silently in Yjs, so it needs detection.
- A few concurrent test runs left invalid trees that normalization didn't
  repair.
- A note changed and moved in one external edit loses a cache-only ID.
- After a rebuild, exact-text restore never gives a wrong ID, but it drops 29%
  of IDs after 20 edits. Zoom URLs for those notes fall back to the document.

## Unverified

- All results come from spikes, mostly headless and with crashes injected in
  process. Headings and blocks were stored as list items, not in RemDo's editor.
- Rendered blocks were tested in Chromium on a small page. Clicking a table puts
  the caret at the end of its source, dragging across a block fails, and
  switching shifts layout.
- Paste, `Enter` inside a fence or table, IME, find in page, screen readers,
  Firefox, Safari and mobile are unchecked.
- Bold, `@` links and dates in source lines must insert Markdown or stay off.
- Email rendering, late offline migration and Yjs undo across a reseed are
  untested.
- Search was designed from research, not spikes.
- Python and JavaScript readers agree, but the outline tree and the Python
  writer haven't been spiked. The real-server tests stored text in a Git repository.
