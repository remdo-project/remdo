# Access Control

RemDo supports the document access cases below. Shared platform terms — tokens,
routing, and document identity — are owned by
[docs/architecture.md](../../architecture.md).

## Document Access Model

1. Every document has one owner.
2. A document may also have zero or more user-specific access grants.
3. New documents start with no user-specific access grants.
4. Only the owner can grant access to another user.
5. A normal document URL is only a document locator.

## Local-Only App Access

- Who: person using a local RemDo app on the same machine.
- Allowed by: local machine access.
- Scope: the local app and its local documents.
- Applies to: an installed local app and
  [local development](../../dev/guides/local-development.md).

## Host-Local Development and Test Access

- Who: developer or CI runner.
- Allowed by: host-local process access.
- Scope: development and test runtimes.
- Applies to: local development and the [test harness](../testing/test-harness.md).

## Authenticated App Access

- Who: signed-in app user.
- Allowed by: Better Auth session accepted by the target app server.
- Scope: the app and the documents exposed by that server.
- Authentication methods: username/password, OAuth, or other login methods the
  target app server supports.
- Identity: the Better Auth session identifies the current user.
- Session UI: the Better Auth session exposes the user's SQL-backed role for
  client navigation and route rendering. Authorization remains server-side.
- Personal app state: the Yjs-backed user-data note exposes the signed-in
  user's document list and app state. SQL document-registry rows are the
  document-list source; `/api/current-user` ensures the projection and home
  rows, then updates the read-only Yjs projection. Browser clients may cache the
  last validated bootstrap only for offline reopen; logout clears it with local
  Yjs offline data.
- Runtime boundary: the client user-data runtime starts only inside the
  authenticated app boundary. Standalone login, enrollment, offline, logout,
  and OAuth consent surfaces render outside it and do not start the runtime,
  even when the surface itself requires an authenticated session.

## Admin Role

Some operations are operator-level, not per-document — server administration
rather than document access. These are gated by a persistent **admin role** on
the user.

- The role is an authorization source of truth, stored in SQL on the Better Auth
  user record. The Yjs user-data projection may reflect it for UI, but
  authorization is always enforced server-side from the SQL record, never from
  the projection.
- Every admin API authorizes from the caller's session + role — except the
  self-enrollment endpoint, which registers a *new* admin account.
- `/admin` is the single admin entry route. It renders by the caller's session
  role: an admin sees the admin panel; anyone else (signed in or not) sees the
  self-enrollment form.
- Self-enrollment is gated by `ADMIN_SECRET` (see
  [docs/config.md](../../config.md#admin-bootstrap-and-enrollment)). The secret
  is a shared gate, any secret-holder can register an admin
  account, and it works independently of the public-signup policy.
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
- [Y-Sweet document client token](../../architecture.md#token-vocabulary): issued
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

## Deferred Access Cases

- Anonymous access.
- Public documents.
- Bearer/link-based access.
- Link revocation/regeneration/invalid-link UX.
- Local-only no-login mode.

## Future

- Define the `ADMIN_SECRET` rotation lifecycle — whether rotating the secret
  affects existing admin accounts or only future enrollment.
- **Enrollment/policy hardening.** Audit-log + rate-limit self-enrollment and any
  public-policy change — one submission now grants a durable admin role, so it is
  not a one-off action.

## References

- [OWASP access-control guidance](https://devguide.owasp.org/en/04-design/02-web-app-checklist/07-access-controls/)
  drives deny-by-default, server-side authorization, least privilege, and
  access-rule tests.
- [OWASP API object authorization](https://owasp.org/API-Security/editions/2019/en/0xa1-broken-object-level-authorization/)
  requires every document-id endpoint to check object-level access.
- [Hono CSRF middleware](https://hono.dev/docs/middleware/builtin/csrf)
  provides the app route CSRF protection for form-style browser mutations.
- [Google Drive](https://support.google.com/drive/answer/2494822?hl=en-GB)
  and [Microsoft 365](https://learn.microsoft.com/en-us/sharepoint/shareable-links-anyone-specific-people-organization)
  sharing models separate named access, public access, and bearer-link access.
- [W3C capability URL guidance](https://www.w3.org/TR/capability-urls/)
  shapes bearer-link revocation, uniqueness, and the separation between share
  links and ordinary document URLs.
