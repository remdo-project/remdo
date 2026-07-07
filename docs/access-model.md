# Access Model

## Purpose

Define the access cases RemDo supports. Shared platform terms — tokens,
routing, document identity — are owned by
[docs/architecture.md](./architecture.md).

## Document Access Model

1. Every document has one owner.
2. A document may also have zero or more user-specific access grants.
3. New documents start with no user-specific access grants.
4. Only the owner can grant access to another user.
5. A normal document URL is only a document locator.
6. Public and bearer-link access are separate access cases outside the sharing
   flow this doc specifies (see [Future](#future)).

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
  self-enrollment endpoint, which registers a *new* admin account (no existing
  session or role to check).
- `/admin` is the single admin entry route. It renders by the caller's role: an
  admin sees the admin panel; anyone else (signed in or not) sees the
  self-enrollment form. The client learns the current user's role from the
  `/api/current-user` bootstrap.
- The admin panel manages the home's **source servers** — add a source by URL,
  register the home on it, see registered state, and remove a source (see
  [Cross-Server Source Linking](#cross-server-source-linking)).
- Self-enrollment is gated by `ADMIN_SECRET` (see
  [docs/config.md](./config.md#admin-bootstrap-and-enrollment)). The secret is
  a shared gate, not tied to one user — any secret-holder can register an admin
  account, and it works independently of the public-signup policy. Promoting an
  *existing* user is a separate, panel-gated capability (see
  [docs/todo.md](./todo.md), admin role follow-ups).
- Admin entry is discoverable by context: a signed-in admin sees an **Admin**
  link in the app toolbar, and a non-public server (closed signup, where
  bootstrapping an admin is expected) surfaces a link to `/admin` from the login
  page. A public server omits the login-page link — `/admin` is still reachable
  directly.

## CSRF Protection

- Session cookies are SameSite=Lax; app routes use Hono's CSRF middleware to
  reject cross-site form-style browser mutations before route handlers run, and
  the app-owned `/api` mutation routes centrally require `application/json`.
  Better Auth owns CSRF/origin handling for `/api/auth/*`. Introducing
  cross-origin credentialed app APIs, cross-subdomain mutation flows, non-JSON
  mutation bodies, or `SameSite=None` cookies requires re-auditing this
  boundary.

## Owner Access

- Who: document owner.
- Allowed by: ownership via `documents.owner_user_id`.
- Scope: the owned document.
- Access: full access.
- [Y-Sweet document client token](./architecture.md#token-vocabulary): issued
  to the owner.

## Named User Access

- Who: authenticated user on the document's local server.
- Allowed by: a direct `document_access` grant from the document owner to the
  grantee user's Better Auth user id.
- Scope: the granted document.
- Access: full access.
- Y-Sweet document client token: issued when the user has a direct grant.
- Sharing UI: the owner enters the grantee's email address; the grant is
  created only if that email matches a local user account.

## Special Documents

- User-data projection and home documents are not shareable.
- Only normal user documents can receive direct access grants.

## Cross-Server Source Linking

Source linking lets one user account work across RemDo servers. At the document
sharing level, sharing still targets a local account on the document's server.

- Source server: owns documents, authenticates its users, stores local document
  grants, and issues Y-Sweet document client tokens.
- Home server: stores the user's OAuth account tokens for linked source
  accounts.
- Source linking: the home server starts OAuth, the user signs in on the source
  server, and Better Auth stores the resulting linked account.
- Delegation scope: a linked source OAuth token is treated as the
  linking user's full delegate on that source server. The home server may call
  authenticated RemDo APIs as that source user, subject to the same owner/grant
  checks the source server applies to the user's normal session. This is an
  account-delegation model, not a cross-user grant.
- Source documents: once linked, the browser can subscribe to source-owned user
  data projections and merge those documents into the same document list. Source
  documents keep the source server's canonical globally unique document IDs;
  source context controls routing and authorization, not document identity.

### Registering a home on a source

A home registers itself on a source and the source issues its OAuth credentials.
This action spans two servers and needs a different access level on each:

- On the **home**, the actor is an **admin** (the "add a source" and "register"
  controls live in the admin panel behind `/admin`, gated by the home's admin
  role — see [Admin Role](#admin-role)). A home's linkable sources are
  admin-managed runtime state, not configuration. Adding one derives a stable
  internal id from the source's origin; a URL that is not a bare origin, or
  duplicates an existing source, is rejected.
- On the **source**, the actor only needs to be a signed-in **user** — any
  ordinary source account, not a source admin.

The flow:

- Registration is an OAuth 2.0 Dynamic Client Registration ceremony carried by
  the operator's browser: the home redirects to the source's confirmation page,
  where the signed-in source user authorizes it; the source binds the new client
  to that user's source account and returns the credentials to the home, which
  persists them and activates the source as a live provider without a restart.
- A source accepts registration only while it is acting as a public source
  (open-signup).
- This **home OAuth client** (the credentialed identity the source issued for
  the home) only identifies a home to the source; it grants no document access on
  its own. Access still flows through per-account linking: each linking user later
  authenticates and consents on the source for their own documents.
- Any home admin can drop a source from the home (removing it from the source
  list and the stored credential), which unlinks it locally. Revoking the **home
  OAuth client on the source** is separate: only the source account that
  registered it can delete it there. If the source later rejects the stored
  credential, a home admin re-registers the source to get a fresh client.

## Future

- Home-admin link retirement that also revokes and rotates the client on the
  source (needs a source-side capability not bound to one account).

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
