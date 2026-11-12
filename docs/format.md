# RemDo text format

Normative for [documents in workspaces](specs/outliner/note-model.md#note-kinds).
Current specs stay authoritative for existing documents until they migrate.

## Purpose

This format is the source of truth for content people create in RemDo,
including their connections to information stored elsewhere.
Other sources, such as email or calendars, keep their native storage.
It is based on CommonMark plus GFM.

## Goals

In decreasing priority:

<!-- markdownlint-disable MD007 MD029 -->
1. Total:: every Markdown file reads as one document, the same in every reader
    > Text the format gives no meaning stays ordinary content, and text it
    > ignores reads as nothing.
1. Stable:: what tools write is canonical, so writing it again changes nothing
    > Tools may rewrite other text to its canonical spelling, keeping what it
    > reads as.
1. Readable and minimal:: little markup
    > People and agents read and write the text comfortably without tooling.
1. Simple to parse:: an unambiguous grammar with few special cases

## Non-goals

- Storing folding state

## Note model

A document is a note whose children are bodies and outline notes, in
file order; its name is held outside the text.
A heading contains everything up to the next heading of its level or higher.

A body is a note holding any Markdown other than a heading or list;
headings and lists inside it are plain content.

An outline note holds:

- Marker:: heading level, bullet or number
- Checkbox:: optional open or checked state after any marker, as in `1. [x]`
- Name:: optional plain text at the start of a note, written as `name:: text`
    > - `::` must be followed by a space or the end of the line
    > - May contain spaces
    > - Only a note that would otherwise look named needs escaping: `Foo\:: bar`
- Text:: one line of inline rich text, including links
    > - Tools write one line; continuation lines in a paragraph join into Text
    > - Links use Markdown syntax with a URI target, as in [note IDs](note:k3x9)
    > - A date link reads as its `date:` target; its label is presentation
    > - Tools escape Text that would otherwise read as Markdown structure
    > - Whitespace at its start and end is not Text, even as a character
    >   reference
- Children:: an ordered list of bodies and outline notes, without
  [property](#properties) lines
    > - Tools indent children under a list item by 4 spaces per level
    > - Tools write `1.` where another number could not interrupt a paragraph
    > - Tools write a blank line before an empty first child after parent text
    > - Tools wrap a body under a list item in `>` lines
    > - Under a heading, a block holding a list or heading keeps its `>` lines
    > - That `>` is a wrapper, so each element inside is one editor line
    > - Any other quote keeps `>` as content and stays one editor line
    > - Adjacent blocks form one body
    > - One top-level element in a block is one editor line
    > - A soft-wrapped paragraph is one editor line holding breaks
    > - Tools separate lines they move or write with a blank line or `>`
- ID:: optional and added lazily, such as when a note is first referenced
    > - An ID is the `id` [property](#properties), such as the one below
    > - A document's ID is a top-level note before its first heading
    > - [Note IDs](specs/outliner/note-ids.md#ids-in-workspaces) own how notes
    >   sharing one resolve
    - id:: k3x9

## Properties

A property is a name the format gives a meaning, written as a named note under
the note it applies to.

- A note's first line with a property's name takes effect, wherever it sits
  directly under the note; later ones, and anything nested under a property
  line, are ignored
- Property lines aren't among the note's children, so they don't decide which
  block comes first
- A value the property doesn't define has no effect
- Property names match exactly
- Tools write a note's first body, then its properties, then its other
  children, and may fix, report or keep other property lines

## Canonical spelling

Tools write:

- Bullet:: `-`
- Heading:: `#` markers for its level, as in `## Title`
- Bold, italic:: `**x**`, `*x*`, with marks moved off surrounding whitespace
- Strikethrough:: `~~x~~`, with marks moved off surrounding whitespace
- Underline:: `<u>x</u>`
- Date:: `[1 Nov 2026](date:2026-11-01)`: day, short English month and year
- Note or document link:: `[x](note:k3x9)`, or `[x](note:Hq3vZp8Lmx_k3x9)` in
  another workspace
- Other file link:: relative path, as in `[x](../assets/chart.png)`
- Code block:: backtick fence
- Hard line break:: trailing `\`
- Rule:: `---`
- File:: LF endings, one final newline

## Follow-up

The [adoption plan](text-format-plan.md) tracks repository integration.

- Align lint with numbering and indentation, then drop this file's exceptions
- Decide how to read YAML front matter
- Keep link reference definitions when writing a document
- Indent children past wide markers such as `100.`
- Insert a blank line before a list that follows an HTML block
- Keep inline HTML when its note is edited
- Define spellings for autolinks, flanking cases and an empty document
