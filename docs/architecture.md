# Architecture

RemDo's cross-cutting architecture defines stable vocabulary, boundaries, and
behavior across platform delivery, routing, document identity, persistence, and
collaboration runtime. The [note model](specs/outliner/note-model.md), [note identity](specs/outliner/note-ids.md), and [link behavior](specs/outliner/links.md) remain
with their outliner owners.

## Delivery Surfaces

Delivery surfaces describe architectural forms; [Run Modes](run-modes.md) owns the supported
run modes.

- **Hosted Web:** Server-rendered app page that loads the SPA in the browser.
- **PWA Shell:** Hosted web with a manifest and service worker for
  [offline app-shell entry](#application-freshness). [Offline document editing](#offline-application-behavior) uses local persistence.
- **Desktop Shell:** Native wrapper (for example Electron/Tauri) hosting the
  same SPA with OS integration. It needs its own start page, since Django
  renders the app page.

Delivery surface choice does not alter outliner semantics.

### Application Freshness

A device registers the service worker once it has a signed-in session. It
removes the worker after a confirmed [logout](specs/access/access-control.md#logout) and whenever the server
reports no session outside an unfinished logout. The worker stores the app page
and serves it for [app route](#gateway) navigations without waiting for the server; the app
then establishes its session state and content as it would online. The app
page's HTML is identical for every visitor, so the stored copy is valid for any
account.
Public downloads, other server-rendered pages, and missing static assets retain
their server responses.
In Production, static HTTP responses require revalidation; dynamic and error
responses are not stored in HTTP caches. Service-worker shell storage remains
available offline. Collaboration and authentication HTTP endpoints remain
network-only.

### Shared Presentation

Django owns every page's header and footer, including the app page's. On the
app page, the SPA renders state only it knows into designated header and footer
regions. The SPA and server-rendered pages share theme values
and styles; account pages load their presentation assets without the editor
runtime.

The header links to About and to the current session action. Pages other than
the app page link Admin for staff, then “Logout” when Django recognizes a
session and “Sign in” otherwise. On the app page, the app renders the session
action once it knows its session state: “Logout” with a session and “Sign in”
on its [signed-out screen](specs/access/access-control.md#authenticated-app-access). Its
[connection-unavailable state](#offline-application-behavior) without
remembered session state hides the header links. “Logout” opens the
[sign-out confirmation](specs/access/access-control.md#logout).

The footer links the [privacy policy](../content/pages/privacy.md), the
[terms of use](../content/pages/terms.md), and the source repository. The app footer
also identifies the loaded frontend with “Build #revision” in readable secondary
text, linking the revision to its commit. Absent metadata shows “Local
development” or “Build unknown”. When startup configuration reports a different
server revision, the app shows a prominent mismatch warning with both commit
links. Missing revisions or unavailable configuration do not imply a mismatch.
The comparison does not monitor subsequent deployments.

### Public Pages

[Public pages](guides/public-pages.md) render repository Markdown through a shared
Django template without sign-in or editor JavaScript. Their canonical URLs use
the [configured public origin](specs/runtime/configuration.md#network-addressing). Page sources, including inline HTML, are trusted like
Django templates.

## Production Bundle Boundary

Development-only routes, UI, editor plugins, and test bridges are gated by
build type: they are available in non-production builds and absent from
production bundles, including production bundles run by development and test workflows.

## Production Instance Boundary

A production instance treats its gateway, API, and collaboration server as one
failure domain. An unexpected process exit identifies the
failed service, stops the remaining processes, and ends the instance
unsuccessfully so its environment can restart the complete instance. When selected,
PostgreSQL runs as a separate service with its own lifecycle.

## Routing and Origin Boundary

Browser collaboration uses the current same-origin WebSocket endpoint. Django
validates browser origins against the [configured trusted origins](specs/access/access-control.md#csrf-protection).

### Gateway

The gateway explicitly owns frontend assets, Django static assets, health
probes, and collaboration endpoints. Django owns all other HTTP routes,
including the app routes ([Home](specs/outliner/home.md) at `/`, `/n/*`, and `/sign-out`),
unknown routes, and their 404 responses. Normal HTTP routes have the
same owner in development and production; development additionally serves
frontend tooling and development-only routes.

Development and production server runtimes expose only the gateway. The RemDo
API and collaboration server remain loopback-only and are reached through it.

### RemDo API boundary

App-owned HTTP surface that sits in front of collaboration infrastructure.

- Auth: Django and allauth own browser session authentication at
  `/api/auth/browser/v1` and administration
  at `/admin/`.
- Django authorizes each collaboration document connection under [Document Access](specs/access/access-control.md#document-access).
- Private collaboration operations use an internal service credential, isolated
  from public gateway traffic.

Django resolves the signed-in user from the session for ownership and document
access decisions.

### Document identity

`docId` is RemDo's canonical document identity. It is intended to be globally
unique across RemDo servers and hubs. Server, source-server, and hub context
select where a document is located and which authority issues access, but they
are not part of canonical document identity.

Each server that creates document IDs must allocate random IDs with enough
entropy to make cross-server collisions negligible without coordination with
other servers. Local registries still reject collisions within one server.
Cross-server collision detection at source-link, import, or projection
boundaries is an extra guard for malformed, legacy, or imported data; it is not
the base namespacing mechanism.

Collaboration and local-persistence layers may key document state by canonical `docId`.

### Document registry

Server-owned document metadata store used for application reads and
collaboration authorization.

- Metadata: owner user id, title, and user-specific access grants.
- Storage: Django models and migrations own the server persistence boundary.
  Request handlers authorize from ORM-backed identity and document metadata.
- Data boundary: the registry is the durable source for document ownership,
  access-critical metadata, and the current per-user document list. Yjs
  documents hold collaborative document content. Browser-facing app resources
  use authenticated HTTP reads and established server-state cache tooling.
- User bootstrap: `/api/current-user` returns the account identity consumed
  under [Authenticated App Access](specs/access/access-control.md#authenticated-app-access). `/api/documents` lists the
  caller's accessible documents.
- Client metadata caches are scoped by server origin and account identity.
  Ending a session clears its metadata and cancels pending reads; a late
  response cannot populate the next account's cache.
- Cached bootstrap data is revalidated on online reads and reconnection;
  using the offline fallback does not make it indefinitely fresh.

### Collaboration credentials and paths

The Django session cookie authenticates browser connections to `/collaboration`.
Hocuspocus forwards the cookie and browser origin to Django before loading
each requested document. Reconnecting repeats authorization; an established
connection retains its authorization until disconnect.

Private authorization and binary content load/store are loopback-only and
require the internal collaboration secret.
Public gateways block internal routes and remove internal credential headers
from browser traffic. Operator tools use the internal credential without a
browser session, and may open only registered documents.

## Runtime Persistence Boundary

Django owns document metadata and binary Yjs state in the [configured database](specs/runtime/configuration.md#database).
Each document's content is stored separately from metadata queries and is
deleted with its registry entry. An existing document without saved content
starts empty; missing registry entries and database failures do not become empty
documents.

One active instance owns collaboration writes. Its SQLite database when
selected uses its persistent storage root; its
[runtime secrets](specs/runtime/configuration.md#secret-bootstrap) use that root
only when it stores them. PostgreSQL persists independently. Recovery requires
the matching database and secrets.

## Collaboration Runtime Building Blocks

### Collab Hub

Backend service clients connect to for realtime sync and persisted document
state. The runtime uses Hocuspocus, with Django as its sole database accessor.

The hub saves complete binary Yjs state and serializes saves per document.
Temporary save failures retain dirty state for retries; dirty documents remain
loaded. A missing registry row terminates its document connections and releases
the cached state without retrying or acknowledging a commit.
Graceful shutdown attempts every loaded document save while Django remains
available and reports any persistence failure.

### Provider

A provider is an adapter that sends and receives `Y.Doc` updates through a
specific sync channel (for example network sync or local persistence).

- **Network provider:** syncs with hub via WebSocket/HTTP.
- **Persistence provider:** stores updates/state locally (IndexedDB, filesystem,
  and similar stores).

Leaving a page stops its collaboration activity without reporting expected
cancellation as a failure. Restoring a retained page resumes only previously
active synchronization. Ending one collaboration consumer does not interrupt
others. Genuine synchronization failures remain observable.

### Local Persistence

Browser persistence stores encrypted Yjs updates and compacted checkpoints in
IndexedDB, scoped to account and cache generation. A separately stored local key
makes ciphertext unreadable after [logout](specs/access/access-control.md#logout). Concurrent tabs preserve one
another's updates during compaction. Closing persistence drains pending writes
and releases database handles. Storage failures remain observable.

Network synchronization and browser persistence have independent lifetimes;
headless consumers attach only the network provider.

### Hydration vs sync

- **Hydrated:** document state is ready for editing (from local persistence or
  server sync).
- **Synced:** provider is connected and the collaboration server has
  acknowledged local changes. This does not imply a committed SQL save; a
  process crash can lose acknowledged edits before a save completes. Database
  outages can extend that window.

Headless writers require an explicit persistence barrier after synchronization
while the document remains attached. Any connection authorized for the document
may request it over that connection. It completes only after Django commits the
full current state, including deletion-only changes, and rejects on persistence
failure.

## Offline Application Behavior

- A remembered session and cached current-user bootstrap under
  [Authenticated App Access](specs/access/access-control.md#authenticated-app-access) allow the application to open without reaching its
  app server.
- A locally cached document opens at its canonical URL, remains editable, and
  persists local edits for synchronization after reconnect. Document-local
  navigation and search remain available.
- A document without a local copy stays at its canonical URL and shows a
  non-editable offline empty state until its content can load.
- A route that cannot establish session state preserves its requested browser
  URL and renders a connection-unavailable state in place. Without remembered
  session state, that fallback exposes only the application identity and
  recovery actions.
- Retry revalidates the current route. Restoration of browser connectivity also
  triggers revalidation.
- While locally available functionality remains usable, the application
  indicates that synchronization is interrupted and local edits will sync after
  reconnection.

### Offline Cache Recovery

Local persistence is best-effort. If browser storage is cleared or evicted,
the document behaves as uncached on the next offline open. Reconnect rehydrates
from the hub and returns the document to normal editing.

### Future

- Provide a locally persisted document inventory so a fresh offline launch can
  list and switch among cached documents from the current server and linked
  sources, using the server-owned metadata boundary.
- Support offline document creation and import through durable local intents
  that reconcile with the server after reconnect. Other server-owned actions
  expose resumable pending state where their authorization semantics permit it.

## Multi-Hub Vocabulary

The terms below describe the target vocabulary for multi-hub document access.

- **Hub registry:** client-owned hub list (`hubId`, base URL, auth source,
  optional capability flags).
- **DocRef model:** runtime locator that carries canonical `docId` plus the
  active hub/source context needed to route and authorize the open.
- **Home hub:** governance term for a document's primary hub; not canonical
  document identity.
- **Replica:** copy of a document hosted on another hub.
- **Replicator:** always-on process for hub-to-hub sync under explicit authorization.
- **Vault:** user-facing collection that may map to one hub or aggregate
  multiple hubs.

## Multi-Hub Guardrails

- Keep an explicit active hub context when opening a document in runtime.

## Code modules

[`config/eslint/boundaries.ts`](../config/eslint/boundaries.ts) owns source-module boundaries. Undeclared source
directories have no import permissions.

## References

- [web.dev: Offline UX design guidelines](https://web.dev/articles/offline-ux-design-guidelines)
  — contextual connectivity feedback and preserving usable content.
- [Chrome for Developers: Managing fallback responses](https://developer.chrome.com/docs/workbox/managing-fallback-responses/)
  — generic service-worker fallback responses when the application shell cannot
  load.
