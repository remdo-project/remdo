# Access Control

Access control combines authenticated identity, administrative authority, and
document ownership or grants. These boundaries determine which app state and
collaboration credentials a user can receive.

Shared token, routing, registry, and document-identity terms are defined in
[Architecture Terms](../../architecture.md).

## Access Scope

User-facing document access is authenticated by a local session or a
[delegated source account](source-linking.md#cross-server-source-linking).
RemDo does not expose anonymous documents, public documents, document-access
links carrying bearer credentials, or a local-only no-login mode.

## Authenticated App Access

A Better Auth session identifies the signed-in user. The server supports
username/password, OAuth, and any other authentication method enabled by its
configuration.

The SQL-backed user role and document registry are the authorization sources of
truth. Session UI and read-only Yjs
[user-data projections](../../architecture.md#document-registry) may expose
their results but do not authorize a request.

The client user-data runtime starts only inside the authenticated app. Login,
enrollment, offline, logout, and OAuth consent surfaces render outside that
runtime, including when the surface requires an authenticated session. A
browser may cache its last validated bootstrap for offline reopen; logout clears
that cache and local Yjs offline data.

## Document Access

These rules apply to each user authenticated by the server.

Every document has one owner. A normal document may have zero or more direct
grants; a new one has none. Its URL only locates it; ownership or a grant
authorizes access.

Only the owner can grant a normal document to another local user. Sharing
identifies the grantee by email; a grant is created only when that email matches
a Better Auth account on the document's server. A direct grant gives that user
full document access. Home documents and user-data projections do not accept
direct grants.

The server issues
[Y-Sweet document client tokens](../../architecture.md#token-vocabulary)
according to the resulting access:

- A normal-document owner or direct grantee receives full access.
- A home-document owner receives full access.
- A user-data-projection owner receives read-only access.
- Other users receive no document client token.

## Admin Role

The SQL-backed Better Auth user role is the authorization source of truth for
server administration. A Yjs user-data projection may expose the role for UI,
but every admin API authorizes from the caller's session and role.

The self-enrollment endpoint is the exception: it registers a new admin account
for a caller that supplies the
[configured admin-enrollment secret](../runtime/configuration.md#secret-bootstrap).
Enrollment is independent of the public-signup policy.

`/admin` is the admin entry route. An admin sees the admin panel; every other
visitor sees the self-enrollment form. A signed-in admin sees an **Admin** link
in the app toolbar. A non-public server also links to `/admin` from its login
page, while a public server leaves the route directly reachable without showing
that link.

## CSRF Protection

Session cookies use `SameSite=Lax`. App-owned mutation routes reject cross-site
form submissions before their handlers run and require `application/json`.
Better Auth owns CSRF and origin handling for `/api/auth/*`. This boundary covers
same-origin credentialed app APIs with JSON mutation bodies.

The CSRF boundary is re-evaluated when a change introduces a cross-origin
credentialed app API, cross-subdomain mutation flow, non-JSON mutation body, or
`SameSite=None` cookie.

Better Auth derives its trusted-origin set from the
[configured canonical public origin](../runtime/configuration.md#derivation-rules).
Production trusts only that origin. Development additionally trusts local
aliases and the loopback PWA preview origin. Preview requests retain their
browser-supplied `Origin`, so unrelated origins remain rejected.

A server's canonical public port namespaces its Better Auth cookies. Local
stacks on shifted port ranges can therefore keep independent sessions while
sharing one browser hostname.

## Future

- Define whether rotating the admin-enrollment secret affects existing admin
  accounts or only future enrollment.
- Add audit logging and rate limiting to self-enrollment and future public-policy
  changes.
- Define anonymous access and public documents.
- Define bearer-link access and its revocation, regeneration, and invalid-link
  behavior.
- Define a local-only no-login mode.

## References

- [OWASP access-control guidance](https://devguide.owasp.org/en/04-design/02-web-app-checklist/07-access-controls/)
- [OWASP API object authorization](https://owasp.org/API-Security/editions/2019/en/0xa1-broken-object-level-authorization/)
- [Hono CSRF middleware](https://hono.dev/docs/middleware/builtin/csrf)
- [W3C capability URL guidance](https://www.w3.org/TR/capability-urls/)
