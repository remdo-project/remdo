# Access Model

## Purpose

Define the access cases RemDo should support.

## Document Access Model

1. Every document has one owner.
2. A document may also have zero or more user-specific access grants.
3. New documents start with no user-specific access grants.
4. Only the owner can grant access to another user.
5. A normal document URL is only a document locator. Possessing it does not
   allow access.
6. Public and bearer-link access are separate future access cases, not part of
   the current sharing flow.

## Local-Only App Access

- Who: person using a local RemDo app on the same machine.
- Allowed by: local machine access.
- Scope: the local app and its local documents.
- Run modes: local self-hosted app, local development.

## Host-Local Development and Test Access

- Who: developer or CI runner.
- Allowed by: host-local process access.
- Scope: development and test runtimes.
- Run modes: local development, unit and collab tests, browser E2E, Docker E2E,
  CI.

## Authenticated App Access

- Who: signed-in app user.
- Allowed by: Better Auth session accepted by the target app server.
- Scope: the app and the documents exposed by that server.
- Authentication methods: username/password, OAuth, or other login methods the
  target app server supports.
- Identity: the Better Auth session identifies the current user.
- Personal app state: the Yjs-backed user-data note exposes the signed-in
  user's document list and app state. SQL document-registry rows are the
  document-list source; `/api/current-user` ensures the projection and home
  rows, then updates the read-only Yjs projection. Browser clients may cache the
  last validated bootstrap only for offline reopen; logout clears it with local
  Yjs offline data.

## Admin Role

Some operations are operator-level, not per-document — server administration
rather than document access. These are gated by a persistent **admin role** on
the user.

- The role is an authorization source of truth, stored in SQL on the Better Auth
  user record. The Yjs user-data projection may reflect it for UI, but
  authorization is always enforced server-side from the SQL record, never from
  the projection.
- Every admin API authorizes from the caller's session + role — except the
  self-enrollment endpoint itself, which has no session+role to check (it is how
  the role is acquired) and is instead gated by `ADMIN_SECRET` (below). The admin
  panel route is gated by session + role too; a non-admin (or unauthenticated)
  visitor is sent to self-enrollment rather than the panel.
- Self-enrollment is gated by `ADMIN_SECRET` (see
  [docs/config.md](./config.md#admin-bootstrap-and-enrollment)): a visitor who
  presents the secret is granted the admin role. The secret is a shared **gate
  to acquire the role**, not an identity tied to one user — one enrollment path,
  and any user who knows the secret can become admin.
- The secret-gated path can always create the enrolling account, independent of
  the public-signup policy. So on an empty server it registers the first account
  and grants the role in one step, and closing public signup never locks out
  admin bootstrap.

## CSRF Protection

- Session cookies are SameSite=Lax; app routes use Hono's CSRF middleware to
  reject cross-site form-style browser mutations before route handlers run, and
  the app-owned `/api` mutation routes centrally require `application/json`.
  Browser app mutations use JSON fetch requests to same-origin `/api` routes.
  Better Auth owns CSRF/origin handling for `/api/auth/*`. Introducing
  cross-origin credentialed app APIs, cross-subdomain mutation flows, non-JSON
  mutation bodies, or `SameSite=None` cookies requires re-auditing this
  boundary.

## Token Vocabulary

- Better Auth session token: browser session credential used by the RemDo API to
  identify the signed-in user.
- OAuth account tokens: Better Auth-managed access, refresh, and ID tokens
  created when a home server links a user's account on a source server.
- Y-Sweet server token: server credential used by the RemDo API to call
  Y-Sweet document-control APIs.
- Y-Sweet document client token: short-lived browser credential issued by the
  RemDo API after document access checks; Y-Sweet enforces it on `/d/*` sync
  paths.

## Owner Access

- Who: document owner.
- Allowed by: ownership via `documents.owner_user_id`.
- Scope: the owned document.
- Access: full access.
- Y-Sweet document client token: issued to the owner.

## Named User Access

- Who: authenticated user on the document's local server.
- Allowed by: a direct `document_access` grant from the document owner to the
  grantee user's Better Auth user id.
- Scope: the granted document.
- Access: full access for now.
- Y-Sweet document client token: issued when the user has a direct grant.
- Sharing lifecycle:
  1. Alice owns `doc123`.
  2. Bob has a user account on the same server.
  3. Alice enters Bob's email address in the sharing UI for `doc123`.
  4. If Bob's email matches a local user account, the server creates the grant.
  5. Bob can see and open `doc123`.

## Special Documents

- User-data projection and home documents are not shareable.
- Only normal user documents can receive direct access grants.

## Cross-Server Source Linking

Source linking lets one user account work across configured RemDo servers. At
the document sharing level, sharing still targets a local account on the
document's server.

- Source server: owns documents, authenticates its users, stores local document
  grants, and issues Y-Sweet document client tokens.
- Home server: stores the user's OAuth account tokens for linked source
  accounts.
- Source linking: the home server starts OAuth, the user signs in on the source
  server, and Better Auth stores the resulting linked account.
- Delegation scope: a linked source OAuth token is currently treated as the
  linking user's full delegate on that source server. The home server may call
  authenticated RemDo APIs as that source user, subject to the same owner/grant
  checks the source server applies to the user's normal session. This is an
  account-delegation model, not a cross-user grant.
- Source documents: once linked, the browser can subscribe to source-owned user
  data projections and merge those documents into the same document list. Source
  documents keep the source server's canonical globally unique document IDs;
  source context controls routing and authorization, not document identity.

## Deferred Access Cases

- Anonymous access.
- Public documents.
- Bearer/link-based access.
- Link revocation/regeneration/invalid-link UX.
- Local-only no-login mode.

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
- [Hono CSRF middleware](https://hono.dev/docs/middleware/builtin/csrf)
  provides the app route CSRF protection for form-style browser mutations.
- [Google Drive](https://support.google.com/drive/answer/2494822?hl=en-GB)
  and [Microsoft 365](https://learn.microsoft.com/en-us/sharepoint/shareable-links-anyone-specific-people-organization)
  sharing models separate named access, public access, and bearer-link access.
- [W3C capability URL guidance](https://www.w3.org/TR/capability-urls/)
  shapes bearer-link revocation, uniqueness, and the separation between share
  links and ordinary document URLs.
