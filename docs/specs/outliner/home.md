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
   A document owned by another user also shows a **Shared** marker beside its
   name, which adds to the row's description without changing its accessible name.

## Document actions

1. **New document** opens a naming dialog before creating a document in the
   local source and opening it.
2. **Upload document** imports a document from a backup file.
3. Each document row has a separate [quick action menu](./menu.md) button.
   Opening it targets that document without opening the document. Its document
   actions match those on the document-root header;
   actions requiring an open outline are absent.

New document and Upload document remain directly visible on Home. The Home
heading is not a document-action target.

### New document

The dialog selects **New Document**, adding the first unused numeric suffix
starting at **2** when taken. Suggestions compare Current Server names, including
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

For signed-in users, opening Home moves keyboard focus to its heading.
Navigation between Home and documents adds browser history
entries, so Back and Forward restore the selected destination. Offline reopen
uses the cached local document list.

## Future

- **Home content in the sidebar.** Also surface Home's document list in a
  persistent navigation sidebar; its division of responsibility with Home
  remains open.
