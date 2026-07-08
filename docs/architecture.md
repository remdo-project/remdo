# Architecture Terms

## Purpose

Provide shared architecture vocabulary for RemDo platform delivery, routing,
document identity, and collaboration runtime so implementation docs can
reference one stable set of terms. It does not define outliner behavior or
note/link identity boundaries; those remain in outliner docs.

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

Delivery surface choice MUST NOT alter outliner semantics.

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
- Y-Sweet document client token issuance: `POST /api/documents/:docId/sync-tokens`
  evaluates ownership and direct user-specific access grants before issuing
  browser credentials for Y-Sweet sync.
- Y-Sweet access: the API connects with the Y-Sweet server token and passes only
  RemDo-issued Y-Sweet document client tokens to browsers.
- Browser-visible collaboration URLs are derived from the server's configured
  canonical public origin, not from request forwarding headers.
- OAuth source linking: Better Auth stores OAuth account tokens for the source
  servers a user has linked.

### Session User

Signed-in user identity used by RemDo API decisions.

- Mapping: Better Auth resolves the active session user.
- Role: identify the user for ownership and document access decisions.

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

Collaboration and local-persistence layers may key document state by canonical
`docId`.

### Document registry

Server-owned document metadata store used by RemDo API before issuing Y-Sweet
document client tokens.

- Metadata: owner user id, document kind, title, and user-specific access
  grants.
- Storage: RemDo metadata queries use Kysely inside the server persistence
  boundary. Route, token, and bootstrap code depend on the `DocumentRegistry`
  interface, not on SQL or query-builder APIs.
- Data boundary: the registry is the durable source for document ownership,
  access-critical metadata, and the current per-user document list. Yjs
  documents hold collaborative document content plus persisted, read-only
  user-data projections for browser-facing app-resource note APIs.
- User bootstrap: `/api/current-user` provisions the signed-in user's personal
  app state, per
  [Authenticated App Access](access-model.md#authenticated-app-access).

### Token vocabulary

- Better Auth session token: browser session credential resolved by Better Auth.
- OAuth account tokens: access, refresh, and ID tokens for linked source-server
  accounts, stored by Better Auth.
- Y-Sweet server token: RemDo API credential for Y-Sweet document-control calls.
- Y-Sweet document client token: short-lived browser credential returned by
  `POST /api/documents/:docId/sync-tokens` and enforced by Y-Sweet on sync paths.

### Browser-facing collaboration paths

- `POST /api/documents/:docId/sync-tokens`: browser-facing Y-Sweet document client
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
- **DocRef model:** runtime locator that carries canonical `docId` plus the
  active hub/source context needed to route and authorize the open.
- **Home hub:** governance term for a document's primary hub; not canonical
  document identity.
- **Replica:** copy of a document hosted on another hub.
- **Replicator:** always-on process for hub-to-hub sync under explicit
  authorization.
- **Vault:** user-facing collection that may map to one hub or aggregate
  multiple hubs.

## Multi-Hub Guardrails

- Keep an explicit active hub context when opening a document in runtime.
