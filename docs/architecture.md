# Architecture Terms

## Purpose

Provide shared architecture vocabulary for RemDo platform delivery, routing, and
collaboration runtime so implementation docs can reference one stable set of
terms. It does not define outliner behavior or note/link identity boundaries;
those remain in outliner docs. Multi-hub/federation terms in this doc are
`[Future]`.

## Related docs

- `docs/environment.md` for env/deployment defaults and script sources of truth.
- `docs/outliner/note-ids.md` and `docs/outliner/links.md` for document/link
  identity behavior.
- `docs/todo.md#collaboration-architecture-roadmap-future` for staged
  implementation planning.

## Delivery Surfaces

- **Hosted Web:** SPA served from server/CDN and loaded by browser.
- **PWA Shell:** Hosted web plus service worker/manifest for offline app-shell
  entry.
- **Desktop Shell:** Native wrapper (for example Electron/Tauri) hosting the
  same SPA with OS integration.

Delivery surface choice must not alter outliner semantics.

## Routing and Origin Boundary

### Gateway

Single HTTP entrypoint that can:

1. serve the SPA
2. proxy collaboration endpoints to the hub
3. optionally expose auth endpoints

Using a gateway keeps origin/routing behavior simple and reduces CORS/auth
drift between app and collab endpoints.

## Collaboration Runtime Building Blocks

### Collab Hub

Backend service clients connect to for realtime sync and persisted document
state. Current runtime implementation uses Y-Sweet.

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
- `[Future]` native desktop options: filesystem or SQLite-backed store.

## Multi-Hub Vocabulary [Future]

The terms below are exploratory and must not be treated as implementation
contracts until promoted out of `[Future]`.

- **Hub registry:** client-owned hub list (`hubId`, base URL, auth source,
  optional capability flags).
- **DocRef model:** potential fully qualified document reference including hub
  context; exact runtime shape is intentionally not fixed yet.
- **Home hub:** governance term for a document's primary hub; not canonical
  document identity.
- **Replica:** copy of a document hosted on another hub.
- **Replicator:** always-on process for hub-to-hub sync under explicit
  authorization.
- **Vault:** user-facing collection that may map to one hub or aggregate
  multiple hubs.

## Future Guardrails [Future]

- Keep identity and location separable so host moves do not redefine document
  identity.
- Keep an explicit active hub context when opening a document in runtime.
