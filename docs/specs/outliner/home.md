# Home

**Home** is the app landing page at `/`. A signed-out visit to `/` that reaches
the [server](../../architecture.md#application-freshness) loads a server-rendered public introduction to
RemDo with a [sign-in](../access/access-control.md#authenticated-app-access) entry, without the app runtime; a signed-out request
carrying a post-sign-in destination goes directly to sign-in. Signed-in users
browse their documents and jump between them.
It sits one level above the [document-root view](./zoom.md#visibility-and-editing-boundary) — the document
is a [note](./note-model.md), and Home is the surface from which its documents are reached.

## Definitions

- **Home:** The landing view. It is not a document and holds no editable outline.
  Home is reached from any document via the leftmost [breadcrumb](./zoom.md#breadcrumbs) crumb.

## Public introduction

When a [home video](../runtime/configuration.md#home-video) is configured, the
public introduction offers it with its poster and a play button that states the
video's duration once known, playing it only when the visitor starts it. A click
anywhere on the video starts it. Once started, the video shows the browser's
standard playback controls, and the play button shows again whenever it is paused.

## Signed-in behavior

1. Home shows document navigation and actions, without a document editor or its
   toolbar. Its heading follows [Location header](./location-header.md).
2. Home lists the user's [accessible documents](../access/access-control.md#document-access)
   in one list under Current Server, omitted when the user has none.
3. Each listed document shows its display name and opens that document when
   activated, landing on its [document-root view](./zoom.md#visibility-and-editing-boundary).
   A document owned by another user also shows a **Shared** marker beside its
   name, which adds to the row's description without changing its accessible name.

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

- **Home content in the sidebar.** Also surface Home's document list in a
  persistent navigation sidebar; its division of responsibility with Home
  remains open.
