# Architecture

RemDo's cross-cutting architecture defines stable vocabulary, boundaries, and
behavior across platform delivery, routing, document identity, persistence, and
collaboration runtime. The [note model](specs/outliner/note-model.md), [note identity](specs/outliner/note-ids.md), and [link behavior](specs/outliner/links.md) remain
with their outliner owners.

## Delivery Surfaces

Delivery surfaces describe architectural forms; [Run Modes](run-modes.md) owns the supported
run modes.

- **Hosted Web:** SPA served from server/CDN and loaded by browser.
- **PWA Shell:** Hosted web with a manifest and service worker for
  [offline app-shell entry](#application-freshness). [Offline document editing](#offline-application-behavior) uses local persistence.
- **Desktop Shell:** Native wrapper (for example Electron/Tauri) hosting the
  same SPA with OS integration.

Delivery surface choice does not alter outliner semantics.

### Application Freshness

The offline navigation fallback serves only application routes. Public downloads,
server-rendered pages, and missing static assets retain their server responses.
In Production, static HTTP responses require revalidation; dynamic and error
responses are not stored in HTTP caches. Service-worker shell storage remains
available offline. Collaboration and authentication HTTP endpoints remain
network-only.

### Shared Presentation

The SPA and server-rendered pages share theme values and styles for
branding, page chrome, and account cards and controls. React and Django retain
their native rendering and interaction ownership; account pages load their
presentation assets without the editor runtime.

The app footer identifies the loaded frontend with “Build #revision” in readable
secondary text, linking the revision to its commit. Absent metadata shows
“Local development” or “Build unknown”. When startup configuration reports
a different server revision, the app shows a prominent mismatch warning with
both commit links. Missing revisions or unavailable configuration do not imply a
mismatch. The comparison does not monitor subsequent deployments.

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

Browser-visible collaboration URLs derive from the [configured canonical public origin](specs/runtime/configuration.md#network-addressing),
not from request forwarding headers.

### Gateway

The gateway explicitly owns SPA routes (`/`, `/n/*`, `/sharing`, and
`/sign-out`), frontend assets, Django static assets, public shared files, health
probes, and collaboration endpoints. Django owns all other HTTP routes,
including unknown routes and their 404 responses. Normal HTTP routes have the
same owner in development and production; development additionally serves
frontend tooling and development-only routes.

Development and production server runtimes expose only the gateway. The RemDo
API and collaboration server remain loopback-only and are reached through it.

In Production, the gateway serves [public shared files](specs/runtime/configuration.md#persistence) at `/share/*` without authentication.

### RemDo API boundary

App-owned HTTP surface that sits in front of collaboration infrastructure.

- Auth: Django and allauth own browser session authentication at
  `/api/auth/browser/v1` and administration
  at `/admin/`.
- Y-Sweet document client token issuance follows [Document Access](specs/access/access-control.md#document-access).
- Y-Sweet access: the API connects with the Y-Sweet server token and passes only
  RemDo-issued Y-Sweet document client tokens to browsers.

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

Server-owned document metadata store used by RemDo API before issuing Y-Sweet
document client tokens.

- Metadata: owner user id, title, and user-specific access grants.
- Storage: Django models and migrations own the server persistence boundary.
  Request handlers authorize from ORM-backed identity and document metadata.
- Data boundary: the registry is the durable source for document ownership,
  access-critical metadata, and the current per-user document list. Yjs
  documents hold collaborative document content. Browser-facing app resources
  use authenticated HTTP reads and established server-state cache tooling.
- User bootstrap: `/api/current-user` returns the account identity and server
  policy consumed under [Authenticated App Access](specs/access/access-control.md#authenticated-app-access). `/api/documents` lists the
  caller's accessible documents.
- Client metadata caches are scoped by server origin and account identity.
  Ending a session clears its metadata and cancels pending reads; a late
  response cannot populate the next account's cache.
- Cached bootstrap data is revalidated on online reads and reconnection;
  using the offline fallback does not make it indefinitely fresh.
- Document creation completes when the server acknowledges the new metadata
  and the result is available to the client. A later list-refresh
  failure does not turn that successful creation into a failed operation.

### Token vocabulary

- Django session cookie: browser session credential resolved against server-side
  session storage.
- Y-Sweet server token: RemDo API credential for Y-Sweet document-control calls.
- Y-Sweet document client token: short-lived browser credential enforced by
  Y-Sweet on sync paths.

### Browser-facing collaboration paths

- `POST /api/documents/:docId/sync-tokens`: browser-facing Y-Sweet document client
  token issuance path owned by RemDo API.
- `/d/*`: browser-facing Y-Sweet sync path used by issued Y-Sweet document
  client tokens; the Y-Sweet server enforces each client token's authorization.
- Y-Sweet document-control routes such as `/doc*` are not routed through the
  app gateway.

## Runtime Persistence Boundary

A production instance keeps its document content and
[generated runtime secrets](specs/runtime/configuration.md#secret-bootstrap) in one persistent storage root belonging to one
running instance and not shared concurrently. Metadata uses the
[configured database](specs/runtime/configuration.md#database): SQLite lives in
that root; PostgreSQL persists independently. Recovery requires matching
metadata, document content, and secrets.

## Collaboration Runtime Building Blocks

### Collab Hub

Backend service clients connect to for realtime sync and persisted document
state. The runtime uses Y-Sweet.

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

Client-side storage for collaboration state defaults to IndexedDB in web and
webview surfaces. Native desktop options are filesystem or SQLite-backed stores.

### Hydration vs sync

- **Hydrated:** document state is ready for editing (from local persistence or
  server sync).
- **Synced:** provider is connected and has no pending unsent local changes.

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
  sources. Introduce that inventory with the replacement for projected
  app-resource reads rather than extending the projection format.
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
