# Workspace store

The workspace store is the source of truth for a workspace's files: it keeps
their current content and full history, and every change to them passes through
it. It holds any kind of file and leaves interpreting the content to its
callers.

## Definitions

- **Workspace:** a named set of files with a stable ID and an owner.
- **File:** a path and its content, as bytes.
- **Revision:** one commit's changes, its author, time, message and parent
  revision.
- **Head:** a workspace's latest revision; a workspace with no commits has none.
- **Expected content:** the version of a file a caller read before changing it,
  or that the file didn't exist.

## Files

1. A file's content reads back exactly as committed, byte for byte.
   **Deterministic.**
2. A file holds at most 10 MiB. **Deterministic.**

## Paths

1. A path is relative, uses `/` between segments, and is stored in Unicode NFC,
   so differently composed spellings name one file. **Deterministic.**
2. Every path can be checked out with Git on Linux, macOS and Windows. A path
   has at most 200 characters, leaving room within Windows' default path length
   for the folder a workspace is cloned into. **Deterministic.**
3. A workspace's files fit a case-insensitive filesystem: no two files or
   folders differ only by case, and no file shares a path with a folder. This
   holds for the files a commit leaves, so a commit may rename a file by
   changing only its case. **Deterministic.**

## Commits

1. A commit applies a set of file writes and deletions as one new revision, all
   at once or not at all. History is a single line: each revision's parent is
   the previous head.
2. A commit states the expected content of every file it changes. If any of
   those files differs, the commit is refused and writes nothing; changes to
   other files never cause a refusal. **Deterministic.**
3. A commit can also state the paths it expects under a folder, and is refused
   when they differ. **Deterministic.**
4. A commit is refused when it would change nothing, or when it deletes a
   missing file. **Deterministic.**
5. A revision can't be deleted on its own. Deleting a workspace deletes its
   whole history, including content no other workspace holds.
   **Deterministic.**
6. Revisions never change once committed.

## Reads

1. Reading a file returns its content and the version to pass back as its
   expected content. A missing file reads as not existing. **Deterministic.**
2. Every revision's files can be rebuilt from history, matching what was
   committed. **Deterministic.**
3. Listing a folder returns the paths of the files under it. **Deterministic.**

## Future

- Store document cache rows when the editor moves to text.
- Store Git commit IDs when the Git adapter arrives.
- Move large file content to an object store, keyed by the same content hash,
  when database size or cost makes it worthwhile.

## References

- [Windows file naming rules](https://learn.microsoft.com/en-us/windows/win32/fileio/naming-a-file)
- [Git path protections](https://git-scm.com/docs/git-config#Documentation/git-config.txt-coreprotectNTFS)
- [Unicode normalization forms](https://unicode.org/reports/tr15/)
