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

The public introduction offers **Keep me posted** for occasional RemDo product
milestone updates. The invitation lives inside Next in the Today/Next section
after the story, with quiet links from the hero and ending. Its native form
records a validated, normalized email address and
request time in the serving instance's database, independently of accounts.
Submission creates no account, document, session, or email verification and
sends no email. New requests are unconfirmed; existing account holders use the
same subscription flow. The same public introduction and form are available at
`/keep-me-posted/`, including to signed-in users.

Repeated submissions preserve the original request, confirmation, and withdrawal
state and receive the same acknowledgement as new requests. Invalid input stays
beside the form. Django's [CSRF protection](../access/access-control.md#csrf-protection) applies; production limits
submissions per client address using the same trusted ingress as [sign-in](../access/access-control.md#authenticated-app-access).

Administrators can search subscription requests, filter confirmation and
withdrawal state, and record withdrawals through Django administration.
Confirmation times are reserved for future subscription confirmation; an
account's verified email does not confirm a public subscription request.
Withdrawn addresses remain excluded after repeated public submissions. The form
links the [privacy policy](../../../content/pages/privacy.md), which describes collection, purpose, retention, and
withdrawal.

The FAQ reveals at most one answer at a time. Opening an answer closes the
previous one; closing the open answer leaves all answers collapsed. The first
answer is initially open.

When a [home video](../runtime/configuration.md#home-video) is configured, the
public introduction offers it with its poster and a play button labeled
**Watch demo**, playing it only when the visitor starts it. A click
anywhere on the video starts it. Once started, the video shows the browser's
standard playback controls, and the play button shows again whenever it is paused.
Hovering anywhere over the video area or focusing its play button reveals a soft
blur halo around the button.

## Signed-in behavior

1. Home shows document navigation and actions, without a document editor or its
   toolbar. Its heading follows [Location header](./location-header.md).
2. Home lists the user's [accessible documents](../access/access-control.md#document-access)
   in one list under Current Server, omitted when the user has none.
3. Each listed document shows its display name and opens that document when
   activated, landing on its [document-root view](./zoom.md#visibility-and-editing-boundary).
   A document owned by another user, or owned by the user with at least one
   [grant](../access/access-control.md#document-access), also shows a **Shared** marker beside its
   name. The marker adds **Shared with you** or **Shared by you** to the row's
   description, respectively, and shows the same text on hover, without changing
   the row's accessible name. On a document the user owns, the marker is a
   separate button that opens the document's
   [sharing surface](../access/access-control.md#document-sharing).
4. Above the list, Home offers [document search](./search.md#document-scope),
   omitted with the list.

## Active row

The document list has at most one **active row**, shown tinted. The
[quick action menu](./menu.md#entry) button and the [document search](./search.md#document-scope) keys target it.

1. The latest input chooses it: the pointer entering a row, including a row
   scrolled under a pointer resting on the list that was the latest input, a
   search arrow key, or keyboard focus or a non-modifier key press within a row.
   Touch input does not. An open menu or dialog holds it.
2. A pointer-chosen row is tinted. A keyboard-chosen row is tinted and edged in
   the accent color. The pointer leaving the rows clears the tint of a
   pointer-chosen row and leaves the menu button on that row unless another row
   becomes active, such as the first match of a non-empty query. An open menu or
   dialog defers that clearing to its closing,
   unless a keyboard close leaves the row keyboard-chosen.
3. Editing or clearing the search query clears the tint of any input-chosen row.
4. While no row is active, the menu button rests on the last chosen row when it
   has actions, otherwise on the first row with actions.

## Shared documents

The **Shared with you** bell in the [signed-in app header](../../architecture.md#shared-presentation) opens a panel listing the
current account's accessible documents owned by others. Each entry names the
document and opens its document-root view. The panel reports an empty list only
after loading, shows listing failures with Retry, and keeps available cached
entries usable. It has no unread state or notification history.

## Document actions

1. **New document** opens a naming dialog before creating a document in the
   local source and opening it.
2. **Upload document** imports a document from a backup file.
3. Each document row with document actions has a separate [quick action menu](./menu.md) button.
   Opening it targets that document without opening the document. Its document
   actions match those on the document-root header;
   actions requiring an open outline are absent.

New document and Upload document remain directly visible on Home. The Home
heading is not a document-action target.

### New document

The dialog selects **New Document**, adding the first unused numeric suffix
starting at **1** when taken. Suggestions compare Current Server names, including
shared documents, ignoring case and outer whitespace. Listing updates leave the
draft intact.

**Create document** or `Enter` submits through
[user data operations](./user-data.md#operations), trimming outer whitespace and preserving
interior spaces. Blank names receive an inline error; custom names may repeat
existing names. `Enter` during input-method composition does not submit.

**Cancel**, `Escape`, or dismissal discards the draft and restores focus to
**New document**. Pending creation blocks editing, dismissal, and resubmission.
Failure retains the draft and input focus with an inline error for retry;
success focuses the first editor note.

## Entering and leaving Home

For signed-in users, opening Home moves keyboard focus to its
[document search](./search.md#document-scope) box, or to its heading when the box
is absent or, unless the [shortcut](./search.md#document-scope) opened Home, on
touch devices as defined by the [mobile toolbar's presence](./mobile-toolbar.md#presence).

Navigation between Home and documents adds browser history
entries, so Back and Forward restore the selected destination. Offline reopen
uses the cached local document list.

## Future

- **Home content in the sidebar.** Also surface Home's document list in a
  persistent navigation sidebar; its division of responsibility with Home
  remains open.
