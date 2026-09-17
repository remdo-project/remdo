# Home

**Home** is the app landing page at `/`. Signed-out users see [sign-in](../access/access-control.md#authenticated-app-access);
signed-in users browse their documents and jump between them.
It sits one level above the [document-root view](./zoom.md#visibility-and-editing-boundary) — the document
is a [note](./note-model.md), and Home is the surface from which its documents are reached.

## Definitions

- **Home:** The landing view. It is not a document and holds no editable outline.
  Home is reached from any document via the leftmost [breadcrumb](./zoom.md#breadcrumbs) crumb.

## Signed-in behavior

1. Home shows document navigation and actions, without a document editor or its
   toolbar. Its heading follows [Location header](./location-header.md).
2. Home lists the user's accessible documents under Current Server.
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
3. Each document row has a separate [quick action menu](./menu.md) button.
   Opening it targets that document without opening the document. Its document
   actions match those on the document-root header;
   actions requiring an open outline are absent.

New document and Upload document remain directly visible on Home. The Home
heading is not a document-action target.

## Entering and leaving Home

For signed-in users, opening Home moves keyboard focus to its heading.
Navigation between Home and documents adds browser history
entries, so Back and Forward restore the selected destination. Offline reopen
uses the cached local document list.

## Future

- **Entry-point backing sources.** Implement favoriting, tagging, and
  visit-history sources for the corresponding groups, replacing the current
  Favorites and Recents document-list slices and empty Tags source, and support
  document- and note-target entries.
- **Home content in the sidebar.** Also surface Home's document, Favorites,
  Tags, and Recents groups in a persistent navigation sidebar; its division of
  responsibility with Home remains open.
