# RemDo text format

Self-contained fresh-start draft: it overrides the rest of the repository, which
adapts once the format settles.

## Purpose

This format is the source of truth for content people create in RemDo,
including their connections to information stored elsewhere.
Other sources, such as email or calendars, keep their native storage.

## Goals

In decreasing priority:

<!-- markdownlint-disable MD029 -->
1. Stable:: a document has one canonical text, and an edit changes only the
   affected lines.
1. Readable and minimal:: the text carries little markup, so people and agents
   can read and write it comfortably without tooling.
1. Simple to parse:: the grammar is unambiguous and has few special cases.

## Non-goals

- Storing folding state

## Note model

A note holds:

- Marker:: bullet, number, open checkbox or checked checkbox
- Name:: optional plain text, written as `name:: text` at the start of a note
- Text:: one line of inline rich text, including links
- Body:: optional multi-line inline rich text
- Children:: an ordered list of notes

## Proposed decisions

- Based on an existing format or a combination of formats
- Note IDs are optional and added lazily, such as when a note is first referenced

## Follow-up

- Allow repeated list numbers in lint, then drop this file's `MD029` exception
