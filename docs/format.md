# RemDo text format

Self-contained fresh-start draft: it overrides the rest of the repository, which
adapts once the format settles.

## Purpose

This format is the source of truth for content people create in RemDo,
including their connections to information stored elsewhere.
Other sources, such as email or calendars, keep their native storage.
It is based on CommonMark plus GFM.

## Goals

In decreasing priority:

<!-- markdownlint-disable MD007 MD029 -->
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
A heading contains everything up to the next heading of its level or higher.

A Markdown block is a note holding any Markdown other than a heading or list;
headings and lists inside it are plain content.

An outline note holds:

- Marker:: heading level, bullet, number, open checkbox or checked checkbox
- Name:: optional plain text at the start of a note, written as `name:: text`
    > - `::` must be followed by a space or the end of the line
    > - May contain spaces
    > - Only a note that would otherwise look named needs escaping: `Foo\:: bar`
- Text:: one line of inline rich text, including links
    > - Tools write one line; continuation lines in a paragraph join into Text
    > - Links use Markdown syntax with a URI target, as in [note IDs](note:k3x9)
    > - Tools escape Text that would otherwise read as Markdown structure
- Children:: an ordered list of Markdown blocks and outline notes
    > - Tools indent children under a list item by 4 spaces per level
    > - Tools wrap a Markdown block under a list item in `>` lines
    > - Under a heading, a block holding a list or heading keeps its `>` lines
    > - Adjacent blocks form one Markdown block
- ID:: optional and added lazily, such as when a note is first referenced
    > An ID is a named note, such as the one below
    - id:: k3x9

## Canonical spelling

Tools write:

- Bullet:: `-`
- Heading:: `#` markers for its level, as in `## Title`
- Bold, italic:: `**x**`, `*x*`
- Strikethrough:: `~~x~~`
- Underline:: `<u>x</u>`
- Date:: `[1 Nov](date:2026-11-01)`
- Code block:: backtick fence
- Hard line break:: trailing `\`
- Rule:: `---`
- File:: LF endings, one final newline

## Follow-up

- Align lint with numbering and indentation, then drop this file's exceptions
- Decide how to read YAML front matter
- Design live collaboration as a merge layer over the text
- Keep link reference definitions when writing a document
- Indent children past wide markers such as `100.`
- Insert a blank line before a list that follows an HTML block
