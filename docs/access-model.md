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
4. Only the owner can change access mode.
5. Explicit grants add identity-bound access.
6. The document registry stores access mode and owner identity.
7. A URL grants access only when its access case defines it as a grant.

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
- Authentication methods: username/password, OAuth, or other login methods the
  target app server supports.
- Identity: the Better Auth session becomes the RemDo `Actor`.
- Personal app state: the Yjs-backed user-data note exposes the signed-in
  user's document list and app state. SQL document-registry rows are the
  document-list source; `/api/me` ensures the projection and home rows, then
  updates the read-only Yjs projection. Browser clients may cache the last
  validated bootstrap only for offline reopen; logout clears it with local Yjs
  offline data.

## Private document access

- Access mode: `private`.
- Actor: document owner.
- Grant: ownership via `documents.owner_user_id`.
- Scope: the private document.
- Access: owner only; non-owner requests are rejected or auto-revoked.
- Token: issued only to the owner; Y-Sweet enforces it on the sync path.

## Shareable document access

- Access mode: `shareable`.
- Actor: document owner and owner-approved authenticated requesters.
- Grant: ownership via `documents.owner_user_id`, or an explicit authenticated
  grant created after owner approval.
- Scope: the shareable document.
- Access requests may reach the owner for approval.

## Public document access

- Access mode: `public`.
- Actor: anyone.
- Grant: normal document URL.
- Scope: the public document.

## Link-shared document access

- Access mode: `link-shared`.
- Actor: anyone with a valid share link.
- Grant: bearer link.
- Share links are distinct from normal document URLs.
- Scope: the link-shared document with read/write access.
- Lifecycle:
  1. Every document starts with access mode `private`.
  2. Enabling link sharing creates one active reusable share link.
  3. Disabling link sharing revokes that link immediately.
  4. Re-enabling creates a different link.

## Cross-server request-to-access document access

- Access type: explicit authenticated grant.
- Owner actor: signed-in owner of a document hosted on one RemDo server.
- Requester actor: signed-in user on another RemDo server.
- Grant: owner approval creates an explicit grant bound to the approved request
  credential.
- Scope: the approved remote document.
- Host: the origin server owns the document and enforces access before issuing
  collaboration tokens.
- Mode: request-to-access sharing requires `shareable`. Approval creates a
  grant; it does not change access mode.
- URL: the normal document URL is a locator, not a grant.
- Remote URL handling: accept only canonical RemDo document URLs, avoid unsafe
  redirects and private-network targets, and do not expose raw upstream errors.
- Requester identity: external human channels identify the requester; approval
  binds to a credential for continuity.
- Request-to-access lifecycle:
  1. The owner changes the document access mode to `shareable` and shares the
     normal document URL outside RemDo.
  2. The requester pastes that URL into another RemDo server.
  3. The requester server sends an access request to the origin server.
  4. The owner approves the request.
  5. The origin server creates the grant, and the requester sees the remote
     document in their server UI.

## References

- [OWASP access-control guidance](https://devguide.owasp.org/en/04-design/02-web-app-checklist/07-access-controls/)
  drives deny-by-default, server-side authorization, least privilege, and
  access-rule tests.
- [OWASP API object authorization](https://owasp.org/API-Security/editions/2019/en/0xa1-broken-object-level-authorization/)
  requires every document-id endpoint to check object-level access.
- [OWASP SSRF guidance](https://cheatsheetseries.owasp.org/cheatsheets/Server_Side_Request_Forgery_Prevention_Cheat_Sheet.html)
  constrains pasted remote URLs.
- [Google AIP-126](https://google.aip.dev/126) supports `access_mode` as a
  small enum-like policy, not a lifecycle state.
- [Google Drive](https://support.google.com/drive/answer/2494822?hl=en-GB)
  and [Microsoft 365](https://learn.microsoft.com/en-us/sharepoint/shareable-links-anyone-specific-people-organization)
  sharing models separate named grants, public access, and bearer-link access.
- [W3C capability URL guidance](https://www.w3.org/TR/capability-urls/)
  shapes bearer-link revocation, uniqueness, and link/locator separation.
