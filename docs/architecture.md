# Architecture Terms

## Purpose

Provide shared architecture vocabulary for RemDo platform delivery, routing, and
collaboration runtime so implementation docs can reference one stable set of
terms. It does not define outliner behavior or note/link identity boundaries;
those remain in outliner docs.

## Delivery Surfaces

- **Hosted Web:** SPA served from server/CDN and loaded by browser.
- **PWA Shell:** Hosted web plus service worker/manifest for offline app-shell
  entry. In production builds, the service worker caches shell/navigation
  assets so routes can open offline, but collaboration/auth HTTP endpoints stay
  network-only. Offline doc editing still works for previously cached docs via
  collaboration local persistence (IndexedDB), not via service-worker endpoint
  caching.
- **Desktop Shell:** Native wrapper (for example Electron/Tauri) hosting the
  same SPA with OS integration.

Delivery surface choice must not alter outliner semantics.

## Routing and Origin Boundary

### Gateway

Single HTTP entrypoint that can:

1. serve the SPA
2. route RemDo API endpoints
3. proxy collaboration endpoints to the hub
4. optionally expose auth endpoints

Using a gateway keeps origin/routing behavior simple and reduces CORS/auth
drift between app and collab endpoints.

### RemDo API boundary

App-owned HTTP surface that sits in front of collaboration infrastructure.

- Auth: Better Auth is mounted at `/api/auth/*`.
- Y-Sweet document client token issuance: `POST /api/documents/:docId/token`
  evaluates document access mode, ownership, and approved user-specific access
  before issuing browser credentials for Y-Sweet sync.
- Y-Sweet access: the API connects with the Y-Sweet server token and passes only
  RemDo-issued Y-Sweet document client tokens to browsers.
- OAuth source linking: Better Auth stores OAuth account tokens for configured
  source servers after the user links a source account.

### Session User

Signed-in user identity used by RemDo API decisions.

- Mapping: Better Auth resolves the active session user.
- Role: identify the user for ownership and document access decisions.

### Document registry

Server-owned document metadata store used by RemDo API before issuing Y-Sweet
document client tokens.

- Role: provide authoritative document metadata before Y-Sweet document client
  token issuance.
- Metadata: access mode, owner user id, document kind, and title.
- Storage: RemDo metadata queries use Kysely inside the server persistence
  boundary. Route, token, and bootstrap code depend on the `DocumentRegistry`
  interface, not on SQL or query-builder APIs.
- Data boundary: the registry is the durable source for document ownership,
  access-critical metadata, and the current per-user document list. Yjs
  documents hold collaborative document content plus a persisted, read-only
  user-data projection for the browser-facing note API.
- User bootstrap: `/api/me` ensures the user's projection/home rows and updates
  the Yjs user-data projection.

### Token vocabulary

- Better Auth session token: browser session credential resolved by Better Auth.
- OAuth account tokens: access, refresh, and ID tokens for linked source-server
  accounts, stored by Better Auth.
- Y-Sweet server token: RemDo API credential for Y-Sweet document-control calls.
- Y-Sweet document client token: browser credential returned by
  `POST /api/documents/:docId/token` and enforced by Y-Sweet on sync paths.

### Browser-facing collaboration paths

- `POST /api/documents/:docId/token`: browser-facing Y-Sweet document client
  token issuance path owned by RemDo API.
- `/d/*`: browser-facing Y-Sweet sync path used by issued Y-Sweet document
  client tokens; the Y-Sweet server enforces each client token's authorization.
- Y-Sweet document-control routes such as `/doc*` are not routed through the
  app gateway.

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

Attaching multiple providers to the same `Y.Doc` is an advanced pattern and
must be intentional.

### Local Persistence

Client-side storage for collaboration state.

- Web/webview default: IndexedDB.
- Native desktop options: filesystem or SQLite-backed store.

### Hydration vs sync

- **Hydrated:** document state is ready for editing (from local persistence or
  server sync).
- **Synced:** provider is connected and has no pending unsent local changes.

### Offline cache recovery contract

- First-open offline with no local document cache shows an offline empty state;
  editing stays unavailable until reconnect.
- Local persistence is best-effort. If browser storage is cleared or evicted,
  the document behaves as uncached on the next offline open.
- Reconnect rehydrates from the hub and returns the document to normal editing.

## Multi-Hub Vocabulary

The terms below describe the target vocabulary for multi-hub document access.

- **Hub registry:** client-owned hub list (`hubId`, base URL, auth source,
  optional capability flags).
- **DocRef model:** fully qualified document reference including hub context.
- **Home hub:** governance term for a document's primary hub; not canonical
  document identity.
- **Replica:** copy of a document hosted on another hub.
- **Replicator:** always-on process for hub-to-hub sync under explicit
  authorization.
- **Vault:** user-facing collection that may map to one hub or aggregate
  multiple hubs.

## Multi-Hub Guardrails

- Keep identity and location separable so host moves do not redefine document
  identity.
- Keep an explicit active hub context when opening a document in runtime.
