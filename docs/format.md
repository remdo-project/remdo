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
1. Stable:: tools write one canonical spelling
    > Untouched text stays byte-identical, so diffs and merges stay clean.
1. Readable and minimal:: little markup
    > People and agents read and write the text comfortably without tooling.
1. Simple to parse:: an unambiguous grammar with few special cases

## Non-goals

- Storing folding state

## Note model

A document is a note whose children are Markdown blocks and outline notes, in
file order; its name is held outside the text.

A Markdown block is a note holding any Markdown other than a heading or list
item; headings and list items inside it are plain content.

An outline note holds:

- Marker:: heading level, bullet, number, open checkbox or checked checkbox
- Name:: optional plain text at the start of a note, written as `name:: text`
    > - `::` must be followed by a space or the end of the line
    > - May contain spaces
    > - Only a note that would otherwise look named needs escaping: `Foo\:: bar`
- Text:: one line of inline rich text, including links
    > Tools write one line; continuation lines in a paragraph join into Text
- Children:: an ordered list of Markdown blocks and outline notes
    > - Tools indent children under a list item by 4 spaces per level
    > - Tools write a Markdown block under a list item in `>` lines

## Proposed decisions

- Based on an existing format or a combination of formats
- Note IDs are optional and added lazily, such as when a note is first referenced

## Follow-up

- Allow repeated list numbers in lint, then drop this file's `MD029` exception
- Decide how to read YAML front matter
