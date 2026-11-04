# Text format adoption plan

Informative temporary ledger for adopting the [RemDo text format](format.md).
Current specifications stay authoritative until each stage moves its contract.
Remove this file when migration finishes.

New documents use this design behind an admin-set experimental flag, so each
stage can merge to `main` without affecting existing documents.

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
  holds current state, so only history views and Git export replay changes.
  The Git adapter adds stored commit IDs in stage 5.
- The [workspace store](specs/workspaces/store.md) owns the file, path, commit
  and read rules.
- Git is a rebuildable projection and sync channel. `git fast-import` builds a
  repository from the tables, and stored commit IDs keep hashes stable, so
  clones never diverge. The same adapter serves clone, export, a user's own
  remote and a local folder of plain files.
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
- Django parses through the shared format module, so search and the editor read
  documents the same way.

### Storage alternatives

- Repositories on disk need two systems backed up consistently.
- Git objects inside Postgres exist only as experimental libgit2 backends that
  need a custom extension.
- Doltgres and Lix version data out of the box but are young. Revisit them if
  the history tables grow beyond this design.
- Wiki.js keeps pages in a database with Git sync, and its two-way sync is
  reported as fragile, so two-way sync comes last.

### Writers

- Django is the one writer per workspace. It owns the workspace tables, MCP,
  revisions and saves.
- The live door is the browser through Yjs. The text door is MCP, Git and any
  API.
- Format logic (parse, check, write and note operations) is one TypeScript
  module, shared by the browser and Django. Django runs it in embedded V8
  (`mini-racer`), at about 60 MB per process; PythonMonkey is the fallback.
- Node shrinks to the Yjs relay and Yjs-to-text conversion, behind three calls:
  save, apply and read live text. Retiring Node later means replacing the relay.
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
  like MCP resources and tools. Subscriptions carry no data.
- The browser uses TanStack Query keyed by URI behind `useNote(uri)`. Open
  documents use existing observation. Backlinks and search run on the server.

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
   - Give each flagged user a personal workspace of Markdown documents.
   - Add note operations for workspaces, folders, documents and files, without
     outline notes, through new MCP tools. Existing tools stay for old
     documents.
   - Exit: an agent can list, read, search, create, move, rename and delete
     flagged documents and files.
2. **Editor on text**
   - Add the JavaScript parser and canonical writer, with write-time alignment
     to the saved text.
   - Express editor test fixtures and expected outlines in the text format
     before changing editor internals, so the same tests check behavior before
     and after.
   - Write operation cases once, as text before, operations, and text after or
     the refusal. Test them on the shared format module, and check each other
     surface, such as MCP or the editor, with only a few of the same cases. Add
     this rule to the [testing policy](dev/testing.md) once it has worked.
   - Extend the editor schema with headings, `block` lines, per-note markers and
     independent checkboxes. Use `line` or `group` storage with no body wrapper.
   - Add Node's three calls, the cache row, the one-transaction save and hash
     recovery.
   - Add cache IDs on RemDo's own node state, with three sync steps: transfer to
     a recreated identical note, repair duplicates, and clear a holder when a
     text `id::` claims its value.
   - Update note content by splicing text, never `clear()` plus `append()`.
   - Add note operations for outline notes on the shared format module, run in
     Django through embedded V8, and their MCP tools.
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
   - Check the contract with one read-only external source spike.
   - Exit: the UI and MCP read closed documents' notes without an editor.
5. **Sharing and Git**
   - Add shared workspaces and members.
   - Add the Git adapter for clone and export, then a user's own remote and a
     local folder, with divergence handling through the note-level merge.
   - Add link rewriting on rename and the broken-link check.
   - Exit: a flagged team shares a workspace, and a user clones it.
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
     headless editors, old MCP tools and old routes.
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

- Moves and renames keep `note:` links working but don't rewrite relative
  links, which can break until stage 5's link rewriting.
- Text changed outside note operations, such as a Git push, skips their
  checks; duplicate IDs it brings are reported, not repaired.
- Per-file versions refuse an agent's call whenever someone saved the same
  document since its read; stage 3's live merge reduces that.

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
- The history tables, the Git adapter and search were designed from research,
  not spikes. The real-server tests stored text in a Git repository.
