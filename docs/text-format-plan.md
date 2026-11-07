# Text format adoption plan

Informative temporary ledger for adopting the [RemDo text format](format.md).
Current specifications stay authoritative until each stage moves its contract.
Remove this file when migration finishes.

New documents use this design behind an experimental flag, a Django permission
that administrators grant, so each stage can merge to `main` without affecting
existing documents. Users without the flag, including directory reviewers, see
the submitted [MCP surface](todo.md#temporary-mcp-compatibility-guards)
unchanged.

## Design

### Storage

- A workspace's files and their history live in the database, Postgres in
  production and SQLite locally, and that content is the source of truth.
  Markdown documents are one kind of file; the store holds any kind as bytes.
- One database backup covers everything while file content stays in the
  database, which suits Markdown and reasonably sized images. Large files can
  later move to an object store under the same content hash. Its objects never
  change once written, so the object store needs only versioning, and unused
  objects are deleted only after backups expire.
- History uses three tables: `blob` holds content keyed by hash, `revision`
  holds the workspace, parent, author, time and message, and `revision_change`
  holds the paths each revision added, changed or deleted. `workspace_file`
  holds current state, so only history views replay changes.
- The [workspace store](specs/workspaces/store.md) owns the file, path, commit
  and read rules.
- Git is a connector, not a mirror. A workspace can connect to one branch of a
  Git remote, optionally one folder of it, over plain Git. A sync fetches only
  that branch's tip, merges a moved tip through the note-level merge, and
  pushes new revisions as fast-forward commits built on the remote tip's tree.
  The connection records the remote commit the workspace is based on.
- What RemDo doesn't hold stays in the remote untouched: history from before
  connecting, other branches and tags, and entries outside the store's rules,
  such as symlinks, file modes, submodules, oversized files, refused paths and
  anything outside the connected folder. Each push changes only the paths
  RemDo changed, so none of it needs storing.
- Cloning a workspace means connecting it to an empty remote of the user's own.
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

### Search

- `document_text` holds each document's current text, and `note_index` holds
  one row per note with its path, position, parent path, ID, text and links.
  Both are rebuilt from the text in the save transaction.
- `note_index` also serves the `note:` resolver, backlinks and MCP `search`.
- Postgres matches with full-text search in the `simple` configuration plus
  `pg_trgm`; SQLite uses FTS5. Every query filters by workspace membership.
- Django parses with the same Python reader as note operations, so search and
  note operations read documents the same way.

### Storage alternatives

- Repositories on disk need two systems backed up consistently.
- Git objects inside Postgres exist only as experimental libgit2 backends that
  need a custom extension.
- Doltgres and Lix version data out of the box but are young. Revisit them if
  the history tables grow beyond this design.
- Wiki.js keeps pages in a database with Git sync, and its two-way sync is
  reported as fragile, so two-way sync comes last.
- GitBook's Git Sync, Git-based content editors such as Decap CMS, TinaCMS and
  Keystatic, and Overleaf's GitHub sync keep their own store and sync one
  branch of a user's repository. The connector follows them rather than
  mirroring repositories.

### Writers

- Django is the one writer per workspace. It owns the workspace tables, MCP,
  revisions and saves.
- The live door is the browser through Yjs. The text door is MCP, Git and any
  API.
- Every note kind lives in Python, in the source that holds its data:
  `backend/workspaces` for the account root, workspaces, folders, documents,
  plain files, outline notes and Markdown blocks; later one adapter per
  external source. One entry point reads notes and applies calls
  for MCP, the REST API and integrations.
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
- Each successful call appends a change-log row, naming the changed references,
  in its own transaction. A server-sent events stream sends a user's new rows
  and replays from `Last-Event-ID` after a reconnect. `LISTEN/NOTIFY` wakes it
  on Postgres; SQLite checks every second.
- Three boundaries stay fixed while the mechanism changes: `useNote(ref)` and
  `observe(ref)` for consumers; events shaped `{ seq, ref, note? }`, where the
  SDK writes a given note into its cache and refetches otherwise; and
  `publish(account, refs)` with `changes(account, after)` on the server. Events
  start without data. Pushing data, which needs a per-connection subscription
  registry, or Redis behind `publish`, waits for monitoring to show the need.
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

- Every reference is a URI, and its scheme picks the source. `note:` is scoped
  to a workspace; only a full URL crosses a workspace or server. Email uses
  `mid:`.
- URLs are `/w/<workspaceId>/n/<id>`, and `/w/<workspaceId>/d/<path>` for
  documents with no text ID.
- Every note has a cache ID in Yjs node state. A reference promotes that value
  to `id::` in the text, and text always overrides the cache.
- [Note operations](specs/outliner/note-operations.md) and
  [note IDs](specs/outliner/note-ids.md#ids-in-workspaces) own the note shape
  and resolution. Source fields are read-only named children.
- A source provides `read`, `list`, `search`, `subscribe` and `invoke`, shaped
  like MCP resources and tools.
- The browser's SDK holds reads in TanStack Query keyed by reference behind
  `useNote(ref)`. Backlinks and search run on the server.

### Documents and bodies

- Permissions belong to the workspace: an owner and members with full access.
- A body is the first run of Markdown block lines before any outline child. It
  is stored as ordinary children and behaves as its own editing region.
- Body lines start as Markdown source, rendered per line when not being edited.
  Rich paragraph lines can follow if users ask, with no text change.
- `folded` stays in Yjs node state.

## Stages

Stages 2 and 4 can run in parallel once stage 1 lands. So can stages 3 and 5
once stage 2 lands.

1. **Foundations**
   - Add the experimental flag, workspace record, history tables and
     `document_text` search.
   - Give each flagged user a personal workspace of Markdown documents on first
     use.
   - Add note operations for the account root, workspaces, folders, documents
     and files, without outline notes, through one MCP tool per operation.
     Existing tools stay for old documents.
   - Exit: an agent can list, read, search, create, move, rename and delete
     flagged documents and files.
2. **Editor on text**
   - Spike the tree first: a Yjs-to-tree-to-text round trip over the corpus
     keeps every byte.
   - Add the Python reader and canonical writer, with write-time alignment to
     the saved text, and the JavaScript reader for paste and test fixtures.
   - Express editor test fixtures and expected outlines in the text format
     before changing editor internals, so the same tests check behavior before
     and after.
   - Write operation cases once, as text before, operations, and text after or
     the refusal. Test them on Python's note operations, and check each other
     surface, such as MCP or the editor, with only a few of the same cases. Add
     this rule to the [testing policy](dev/testing.md) once it has worked.
   - Extend the editor schema with headings, `block` lines, per-note markers and
     independent checkboxes. Use `line` or `group` storage with no body wrapper.
   - Add Node's three calls, the cache row with the last-saved tree, the
     one-transaction save and hash recovery.
   - Add cache IDs on RemDo's own node state, with three sync steps: transfer to
     a recreated identical note, repair duplicates, and clear a holder when a
     text `id::` claims its value.
   - Update note content by splicing text, never `clear()` plus `append()`.
   - Add Python note operations for outline notes and Markdown blocks, and
     their MCP tools. Let each note resolve its own children and name the kinds
     it holds, instead of deciding kinds from paths, and let each kind class
     register itself.
   - Add the notes REST API, the change log and its stream on the same entry
     points as MCP, and let Home list the account root's workspaces and
     documents through the SDK. Test that the SDK catches up after the stream
     drops.
   - Move the open document's semantic operations into note operations, as a
     complete contract migration once the pending MCP reviews allow it.
     Consider the [note range](specs/outliner/selection.md#note-ranges) as the
     operand of Move and Delete.
   - Test that each editor action changes the document as some sequence of
     note operations would.
   - Exit: a flagged document edits and saves byte-stably in the real editor,
     passing the randomized test and a real process kill, and an agent changes
     it through note operations without disturbing other notes or IDs.
3. **Live safety**
   - Add the text door for open documents and generation IDs.
   - Keep each client's last synced text, and add the stale-client merge.
   - Show same-word and delete-versus-edit conflicts to the user.
   - Add agent change review: a note-level diff with per-hunk revert.
   - Exit: two editors and an agent work together with no silent loss outside
     the known move limit.
4. **Note layer**
   - Add `note_index`, `resolve(uri)` and the new URL routes.
   - Add `useNote`, backlinks, search and the workspace source.
   - Give the Python account root the
     [user-data hierarchy](specs/outliner/user-data.md#hierarchy), replacing
     the SDK's `user-data`, `document-source` and `collection` kinds; the SDK
     becomes a REST client plus the editor session. Decide whether workspaces
     sit under a source per server.
   - Check the contract with one read-only external source spike.
   - Exit: the UI and MCP read closed documents' notes without an editor.
5. **Sharing and Git**
   - Add shared workspaces and members.
   - Survey a few dozen public vault and docs repositories for what the
     connector must leave untouched: merges, branches, symlinks, modes,
     submodules, large files, refused paths and history size.
   - Add the Git connector to one branch, optionally one folder, of a remote.
   - Add link rewriting on rename and the broken-link check.
   - Exit: a flagged team shares a workspace connected to a repository branch,
     and edits on either side reach the other without changing what RemDo
     doesn't hold.
6. **Migration**
   - Reassess rich body paragraphs, since today's bodies show rich text.
   - Count sharing combinations and dry-run on a copy of production data.
   - Convert user by user: move a document only if export, read-back and tree
     comparison pass, and report failures.
   - Put unshared documents in the owner's personal workspace, and each shared
     document in its own workspace. Access never widens.
   - Keep every old ID as a cache ID, promote referenced ones, reapply fold
     flags and redirect old `/n/` URLs.
   - Start history with one import revision per workspace. Undo resets.
   - Keep old Yjs state read-only for a grace period. Late offline clients sync
     into it, and the server applies the difference through the text door.
   - Exit: every document has moved or is reported.
7. **Cleanup**
   - Remove `DocumentContent`, `DocumentGrant`, the body wrapper, per-call
     headless editors and old routes.
   - Before changing the MCP surface for everyone, check the published OpenAI
     plugin and any pending directory review for updates they need.
   - Move this design into its owning specifications, and remove the format's
     note on existing documents.
   - Give the remaining existing kinds, such as account roots and user data
     notes, note operations or retire them.
   - Drop editor documents from the access roots and their sharing rules.
   - Rename what remains of the open document to the editor session.
   - Fold the remaining `docs/todo.md`, legacy backlog and format Follow-up
     items into their owners, then delete this plan.

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
- Moves and renames keep `note:` links working but don't rewrite relative
  links, which can break until stage 5's link rewriting.
- Text changed outside note operations, such as a Git push, skips their
  checks; duplicate IDs it brings are reported, not repaired.
- Per-file versions refuse an agent's call whenever someone saved the same
  document since its read; stage 3's live merge reduces that.
- Until stage 2, Read returns a document's content but not its children, nor
  whether it has any, and Insert into a document and Ensure ID are refused.
- Until stage 4, Read of the account root lists its workspaces but not its
  [user-data](specs/outliner/user-data.md#hierarchy) collections.
- Note operations can't create a folder: a folder exists only while it holds a
  file, and Insert has no way to add one with its first file.

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
- The history tables, the Git connector and search were designed from research,
  not spikes.
- Python and JavaScript readers agree, but the outline tree and the Python
  writer haven't been spiked. The real-server tests stored text in a Git repository.
