# RemDo text format

Self-contained fresh-start draft: it overrides the rest of the repository, which
adapts once the format settles.

## Purpose

This format is the source of truth for content people create in RemDo,
including their connections to information stored elsewhere.
Other sources, such as email or calendars, keep their native storage.

## Proposed requirements

- Easily readable by humans, yet explicit for parsers
  - Ruled-out examples: XML, JSON
- Based on an existing format or a combination of formats
- Note IDs are optional and added lazily, such as when a note is first referenced
