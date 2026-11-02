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
- **Expected content:** what a caller read for a file before changing it: its
  content hash, or that the file didn't exist.

## Files

1. A file's content reads back exactly as committed, byte for byte.
   **Deterministic.**
2. A file holds at most 10 MiB. **Deterministic.**

## Paths

1. A path is relative, uses `/` between segments, and is stored in Unicode NFC,
   so differently composed spellings name one file. **Deterministic.**
2. Every path can be checked out on Linux, macOS and Windows:
   **Deterministic.**
   - No empty, `.` or `..` segments.
   - No control characters, and none of `<>:"|?*\`.
   - No segment ending in `.` or a space, and no Windows device name such as
     `CON` or `COM1`, with or without an extension.
   - No segment longer than 255 bytes, and no path longer than 500 characters.
3. A workspace's files fit a case-insensitive filesystem: no two paths differ
   only by case, and no file shares a path with a folder. **Deterministic.**

## Commits

1. A commit applies a set of file writes and deletions as one new revision on
   top of the head, all at once or not at all. Commits to one workspace apply
   one at a time, so history is a single line.
2. A commit states the expected content of every file it changes. If any of
   those files differs, the commit is refused and writes nothing; changes to
   other files never cause a refusal. **Deterministic.**
3. A commit is refused when it would change nothing, or when it deletes a
   missing file. **Deterministic.**
4. A commit may delete a file and add one differing only by case, which renames
   it. **Deterministic.**
5. Revisions are immutable. A revision can't be deleted on its own; deleting a
   workspace deletes its whole history. **Deterministic.**

## Reads

1. Reading a file returns its content and content hash, to pass back as its
   expected content. A missing file reads as not existing. **Deterministic.**
2. Every revision's files can be rebuilt from history, matching what was
   committed. **Deterministic.**

## Future

- Store document cache rows when the editor moves to text.
- Store Git commit IDs when the Git adapter arrives.
- Move large file content to an object store, keyed by the same content hash,
  when database size or cost makes it worthwhile.

## References

- [Windows file naming rules](https://learn.microsoft.com/en-us/windows/win32/fileio/naming-a-file)
- [Unicode normalization forms](https://unicode.org/reports/tr15/)
