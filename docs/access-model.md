# Access Model

## Purpose

Define the access cases RemDo should support.

## Shared questions

For each access case, the important questions are:

1. who is the actor
2. what grants access
3. what the actor may access
4. which run modes should support the case

## Document access model

1. Every document has one access mode.
2. A document may also have zero or more explicit authenticated grants.
3. New documents start with access mode `private` and no explicit grants.
4. Access mode defines broad exposure.
5. Explicit authenticated grants define identity-bound access beyond the broad
   access mode.
6. Access mode and owner identity are server-owned document metadata stored in
   the document registry.

## Local-only app access

- Actor: person using a local RemDo app on the same machine.
- Grant: local machine access.
- Scope: the local app and its local documents.
- Run modes: local self-hosted app, local development.

## Host-local development and test access

- Actor: developer or CI runner.
- Grant: host-local process access.
- Scope: development and test runtimes.
- Run modes: local development, unit and collab tests, browser E2E, Docker prod E2E, CI.

## Authenticated app access

- Actor: signed-in app user.
- Grant: Better Auth session accepted by the target app server.
- Scope: the app and the documents exposed by that server.
- Run modes: self-hosted app server, managed cloud app server.
- Authentication methods: username/password, OAuth, or other login methods the
  target app server supports.
- Current server-mode anchor: RemDo `Actor` currently maps directly to the
  Better Auth user/session identity.
- Personal app state: the Yjs-backed user-config note exposes the signed-in
  user's document list and other personal app state through the existing note
  API. SQL document-registry rows are the durable source for the current
  document list; `/api/profile` ensures the per-user config projection and
  home document rows exist, then updates the persisted, read-only Yjs
  user-config projection.

## Private document access

- Access mode: `private`.
- Actor: document owner.
- Grant: ownership via `documents.owner_user_id`.
- Scope: the private document.
- Run modes: self-hosted app server, managed cloud app server.
- Current implementation: new documents are registered to the current Better
  Auth user, and private document tokens are issued only to that owner.

## Public document access

- Access mode: `public`.
- Actor: anyone.
- Grant: normal document URL.
- Scope: the public document.
- Run modes: self-hosted app server, managed cloud app server.

## Link-shared document access

- Access mode: `link-shared`.
- Actor: anyone with a valid share link.
- Grant: bearer link.
- Scope: the shared document with read/write access.
- Login: this case should work without user login.
- Recipient scope: the recipient may be a different user from the one who
  created the link.
- Run modes: self-hosted app server, managed cloud app server.
- Lifecycle:
  1. Every document starts with access mode `private`.
  2. A user can enable sharing for the current document.
  3. Enabling sharing creates a share link for that document.
  4. While share-link creation is still in progress, the document is in a
     generating state.
  5. Once generation completes, the share link is visible and reusable.
  6. A user can disable sharing for the current document.
  7. Disabling sharing revokes the current share link immediately.
  8. A revoked share link must no longer open the document.
  9. Re-enabling sharing after revocation creates a new share link.
  10. The newly created share link must differ from the previously revoked one.
  11. At most one share link is active for a document at a time.

## Cross-server authenticated document access

- Access type: explicit authenticated grant.
- Actor: signed-in user using a RemDo client that can access more than one
  server.
- Grant: authenticated document access bound to a remote identity or auth
  reference on another server.
- Scope: remote documents hosted on another RemDo server and shown in the
  client alongside local documents.
- Run modes: local self-hosted app, self-hosted app server, managed cloud
  app server.
- Client shape: one client may use documents from more than one RemDo server at
  the same time.
- Account scope: this may cover one person's accounts on different servers or
  one person sharing with another person on a different server.
