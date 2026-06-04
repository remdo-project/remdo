# Access Model

## Purpose

Define the access cases RemDo should support.

## Document access model

1. Every document has one access mode.
2. A document may also have zero or more user-specific access entries.
3. New documents start with access mode `private` and no user-specific access.
4. Only the owner can change access mode.
5. Approved user-specific access adds identity-bound access.
6. The document registry stores access mode and owner identity.
7. A URL allows access only when its access case explicitly says it does.

## Local-only app access

- Who: person using a local RemDo app on the same machine.
- Allowed by: local machine access.
- Scope: the local app and its local documents.
- Run modes: local self-hosted app, local development.

## Host-local development and test access

- Who: developer or CI runner.
- Allowed by: host-local process access.
- Scope: development and test runtimes.
- Run modes: local development, unit and collab tests, browser E2E, Docker prod E2E, CI.

## Authenticated app access

- Who: signed-in app user.
- Allowed by: Better Auth session accepted by the target app server.
- Scope: the app and the documents exposed by that server.
- Authentication methods: username/password, OAuth, or other login methods the
  target app server supports.
- Identity: the Better Auth session identifies the current user.
- Personal app state: the Yjs-backed user-data note exposes the signed-in
  user's document list and app state. SQL document-registry rows are the
  document-list source; `/api/me` ensures the projection and home rows, then
  updates the read-only Yjs projection. Browser clients may cache the last
  validated bootstrap only for offline reopen; logout clears it with local Yjs
  offline data.

## Private document access

- Access mode: `private`.
- Who: document owner.
- Allowed by: ownership via `documents.owner_user_id`.
- Scope: the private document.
- Access: owner only; non-owner requests are rejected.
- Token: issued only to the owner; Y-Sweet enforces it on the sync path.

## Shareable document access

- Access mode: `shareable`.
- Who: document owner and owner-approved authenticated requesters.
- Allowed by: ownership via `documents.owner_user_id`, or approved
  user-specific access.
- Scope: the shareable document.
- Access requests may reach the owner for approval.

## Public document access

- Access mode: `public`.
- Who: anyone.
- Allowed by: normal document URL.
- Scope: the public document.

## Link-shared document access

- Access mode: `link-shared`.
- Who: anyone with a valid share link.
- Allowed by: bearer link.
- Share links are distinct from normal document URLs.
- Scope: the link-shared document with read/write access.
- Lifecycle:
  1. Every document starts with access mode `private`.
  2. Enabling link sharing creates one active reusable share link.
  3. Disabling link sharing revokes that link immediately.
  4. Re-enabling creates a different link.

## Same-server request-to-access document access

- Who: owner and requester are signed-in users on the same RemDo server.
- Allowed by: owner approval for the requester's Better Auth user.
- Scope: the requested document.
- Host: that server owns the document and enforces access before issuing
  collaboration tokens.
- Mode: request-to-access sharing requires `shareable`. Approval creates a
  user-specific access entry; it does not change access mode.
- Private transition: changing the document back to `private` hides it from
  approved requesters and denies their tokens, but keeps their approved access
  entries. Changing the document back to `shareable` makes those approvals
  effective again.
- URL: the normal document URL identifies the document; it does not allow access.
- Revoked access cannot be reopened by the requester inside RemDo; only the
  owner can approve that user again.
- Request-to-access lifecycle:
  1. The owner changes the document access mode to `shareable` and shares the
     normal document URL outside RemDo.
  2. The requester signs in on the same server and requests access.
  3. The owner approves the request.
  4. The requester can open the document.

## Cross-server source linking

Cross-server access uses the same user-specific access model. The user has an
account on the document source server, and document owners approve that source
server user. A home server can list or open those documents only after the user
links the source server account through OAuth.

- Source server: owns documents, authenticates its users, approves access, and
  issues collaboration tokens.
- Home server: stores the user's linked source account tokens and presents the
  source documents in the user's document list.
- Token path: the home server uses short-lived source-server access tokens for
  source catalogs and document tokens.

## References

- [OWASP access-control guidance](https://devguide.owasp.org/en/04-design/02-web-app-checklist/07-access-controls/)
  drives deny-by-default, server-side authorization, least privilege, and
  access-rule tests.
- [OWASP API object authorization](https://owasp.org/API-Security/editions/2019/en/0xa1-broken-object-level-authorization/)
  requires every document-id endpoint to check object-level access.
- [Better Auth OAuth/OIDC provider](https://better-auth.com/docs/plugins/oauth-provider)
  supports the source-server authorization role.
- [Better Auth generic OAuth](https://better-auth.com/docs/plugins/generic-oauth)
  supports configured OAuth client providers for the home-server role.
- [Google AIP-126](https://google.aip.dev/126) supports `access_mode` as a
  small enum-like policy, not a lifecycle state.
- [Google Drive](https://support.google.com/drive/answer/2494822?hl=en-GB)
  and [Microsoft 365](https://learn.microsoft.com/en-us/sharepoint/shareable-links-anyone-specific-people-organization)
  sharing models separate named access, public access, and bearer-link access.
- [W3C capability URL guidance](https://www.w3.org/TR/capability-urls/)
  shapes bearer-link revocation, uniqueness, and the separation between share
  links and ordinary document URLs.
