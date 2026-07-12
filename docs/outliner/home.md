# Home

## Purpose

Define the **Home** view: the top of the navigation hierarchy, above any single
document. Home is where a user browses their documents and jumps between them.
It sits one level above the document-root [zoom](./zoom.md) view — the document
is a [note](./concepts.md), and Home is the surface from which its documents are
reached.

## Definitions

- **Home:** The view listing the user's documents and their entry points
  (tags, favorites, recents). It is not a document and holds no editable outline.
- **Home crumb:** The leftmost [breadcrumb](./zoom.md#breadcrumbs) item,
  labelled "Home", present in every document view. Activating it opens Home.

## Core behavior

1. Home replaces the editor in the content region: while Home is shown, no
   document outline is visible, the same way [Search](./search.md) mode takes
   over the content region.
2. Home lists the user's documents grouped by source: the local server and each
   linked [source server](../access-model.md#cross-server-source-linking), under
   a heading per group.
3. Each listed document shows its display name and opens that document when
   activated, landing on its document-root [zoom](./zoom.md) view.
4. Home presents three additional entry-point groups alongside the document
   list: **Favorites**, **Tags**, and **Recents**. Each is a list of shortcuts
   into documents or document notes.
5. A group with no entries is omitted from Home entirely; Home never shows an
   empty group as a placeholder.

## Document actions

1. **New document** creates a document in the local source and opens it.
2. **Upload document** imports a document from a backup file.

## Entering and leaving Home

1. On the local Home document, clearing zoom at the document root returns to
   `/` (owned by [Zoom routing](./zoom.md#routing)); Home is the surface above
   that root.

## Future

- **Home content in the sidebar.** The document list and the Favorites / Tags /
  Recents groups are intended to also surface in a persistent navigation
  sidebar, so a user can browse and switch without leaving the current document.
  Home (this view) and the sidebar would present the same content in two places;
  the division of responsibility between them remains an open design question.
