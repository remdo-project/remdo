# Home

**Home** sits at the top of the navigation hierarchy, above any single document,
and lets a user browse their documents and jump between them.
It sits one level above the [document-root view](./zoom.md#visibility-and-editing-boundary) — the document
is a [note](./note-model.md), and Home is the surface from which its documents are reached.

## Definitions

- **Home:** The view listing the user's documents and their entry points. It is
  not a document and holds no editable outline. Home is reached from any document
  via the leftmost [breadcrumb](./zoom.md#breadcrumbs) crumb.

## Core behavior

1. Home replaces the editor in the content region: while Home is shown, no
   document outline is visible.
2. Home lists the user's documents grouped by source: the local server and each
   linked [source server](../access/source-linking.md#server-roles), under a heading per group.
3. Each listed document shows its display name and opens that document when
   activated, landing on its [document-root view](./zoom.md#visibility-and-editing-boundary).
4. Home presents three additional entry-point groups alongside the document
   list: **Favorites**, **Tags**, and **Recents**. Favorites lists entries from
   favoriting, Tags from tagging, and Recents from visit history. An entry may
   target a document or a note within one.
5. A group with no entries is omitted from Home entirely; Home never shows an
   empty group as a placeholder.

## Document actions

1. **New document** creates a document in the local source and opens it.
2. **Upload document** imports a document from a backup file.

## Entering and leaving Home

1. On the local Home document, clearing zoom at the document root returns to
   `/` (owned by [Zoom routing](./zoom.md#routing)); Home is the surface above that root.

## Future

- **Entry-point backing sources.** Implement favoriting, tagging, and
  visit-history sources for the corresponding groups, replacing the current
  Favorites and Recents document-list slices and empty Tags source, and support
  document- and note-target entries.
- **Home content in the sidebar.** Also surface Home's document, Favorites,
  Tags, and Recents groups in a persistent navigation sidebar; its division of
  responsibility with Home remains open.
