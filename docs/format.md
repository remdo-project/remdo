# RemDo text format

Self-contained fresh-start draft: it overrides the rest of the repository, which
adapts once the format settles.

## Purpose

This format is the source of truth for content people create in RemDo,
including their connections to information stored elsewhere.
Other sources, such as email or calendars, keep their native storage.

## Goals

In decreasing priority:

1. **Stable:** a document has one canonical text, and an edit changes only the
   affected lines.
2. **Readable and minimal:** the text carries little markup, so people and agents
   can read and write it comfortably without tooling.
3. **Simple to parse:** the grammar is unambiguous and has few special cases.

## Proposed decisions

- Based on an existing format or a combination of formats
- Note IDs are optional and added lazily, such as when a note is first referenced
