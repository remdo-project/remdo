# Access Control

Access control combines authenticated identity, administrative authority, and
document ownership or grants. These boundaries determine which app state and
collaboration credentials a user can receive.

## Access Scope

User-facing document access is authenticated by a local session or a
[delegated source account](source-linking.md#cross-server-source-linking).
RemDo does not expose anonymous documents, public documents, document-access
links carrying bearer credentials, or a local-only no-login mode.

## Authenticated App Access

A Django session identifies the signed-in user. The server supports
username/password, OAuth, and any other authentication method enabled by its
configuration.

The SQL-backed user role and [document registry](../../architecture.md#document-registry) are the
authorization sources of truth. Session UI and [client metadata caches](../../architecture.md#document-registry) may expose
their results but do not authorize a request.

The client metadata runtime starts only inside the authenticated app. Login,
administration, offline, and OAuth consent surfaces render outside that runtime,
including when the surface requires an authenticated session. A browser may
cache its last validated bootstrap for offline reopen.

## Logout

Logout is a local act on one device. It always completes, including offline: no
unreachable server and no undeletable database leaves the user signed in, and
every step is bounded so the act cannot stall.

Logout clears the cached bootstrap and the device's local Yjs offline data.
Deleting the offline encryption key satisfies that clearing: the remaining
ciphertext is unreadable, so a database the browser refuses to drop does not
leave readable user data behind.

If this device holds edits the server has not acknowledged, logout asks
before discarding them. Acknowledged work is not prompted.

The server session is revoked as part of logout. A revocation the device could
not deliver is retried until the server confirms it, and until then that device
reports no session rather than resuming the one it failed to end. Signing in
again supersedes an undelivered revocation.

Signing out of one browser tab signs out every tab sharing its storage, which
stops using the local data it is losing.

## Document Access

These rules apply to each user authenticated by the server.

Every document has one owner. A normal document may have zero or more direct
grants; a new one has none. Its URL only locates it; ownership or a grant
authorizes access.

Only the owner can grant a normal document to another local user. Sharing
identifies the grantee by email; a grant is created only when that email matches
an account on the document's server. A direct grant gives that user
full document access. Home documents do not accept direct grants.

Users with full document access may [rename the document](../outliner/location-header.md#document-rename). The source authorizes
each submission using the caller's current access; client metadata caches do not
authorize changes.

The server issues [Y-Sweet document client tokens](../../architecture.md#token-vocabulary) according to the resulting
access:

- A normal-document owner or direct grantee receives full access.
- A home-document owner receives full access.
- Other users receive no document client token.

## Admin Role

Django user permissions are the authorization source of truth for
server administration. The client may expose the role for UI, but Django
authorizes every administrative request from the caller's session and
permissions.

An operator creates the initial administrator through Django's `createsuperuser`
management command. Administrators manage subsequent accounts through Django
administration, independently of the public-signup policy.

`/admin/` is the Django administration entry route. Django staff status permits
entry; model permissions control the available administrative actions. An
authenticated staff user sees an **Admin** link in the app toolbar. Other
visitors authenticate through Django's administration sign-in form.

## CSRF Protection

Session cookies use `SameSite=Lax` and are HTTP-only. Django's CSRF middleware
protects session-authenticated mutation routes, including sign-in and logout.
Browser requests send the CSRF token in `X-CSRFToken`; missing or invalid tokens
and untrusted origins are rejected before application handlers run. Tokens for
cross-site credentialed APIs require a separate accepted authentication
contract.

Django enforces trusted origins supplied by the resolved [runtime configuration](../runtime/configuration.md#network-addressing).
Production trusts only that origin. Development additionally trusts local
aliases and the loopback PWA preview origin. Preview requests retain their
browser-supplied `Origin`, so unrelated origins remain rejected.

A server's canonical public port namespaces its session and CSRF cookies. Local
stacks on shifted port ranges keep independent sessions while sharing one
browser hostname.

## Future

- Add audit logging and rate limiting to future public-policy changes.
- Define anonymous access and public documents.
- Define bearer-link access and its revocation, regeneration, and invalid-link behavior.
- Define a local-only no-login mode.

## References

- [OWASP access-control guidance](https://devguide.owasp.org/en/04-design/02-web-app-checklist/07-access-controls/)
- [OWASP API object authorization](https://owasp.org/API-Security/editions/2019/en/0xa1-broken-object-level-authorization/)
- [Django CSRF protection](https://docs.djangoproject.com/en/6.1/howto/csrf/)
- [W3C capability URL guidance](https://www.w3.org/TR/capability-urls/)
