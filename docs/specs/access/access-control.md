# Access Control

Access control combines authenticated identity, administrative authority, and
document ownership or grants. These boundaries determine which app state and
collaborative document state a user can access.

## Access Scope

User-facing document access is authenticated by a session on the server that
owns the document.
RemDo does not expose anonymous documents, public documents, document-access
links carrying bearer credentials, or a local-only no-login mode.

## Authenticated App Access

A Django session identifies the signed-in user. The server supports
email/password authentication. Operators create accounts through Django
administration or management commands; public signup is closed.
Creating an account also creates one empty document titled **New Document**.
Account and document creation succeed together. Later account updates and reads
leave the document inventory unchanged.

Allauth renders sign-in at `/accounts/login/` and validates credentials.
Successful sign-in returns to the requested same-origin app destination,
defaulting to Home. The app keeps an in-place signed-out screen after logout
so offline logout does not require a server-rendered page.

Production allauth sign-in retains the framework's rate limits. IP-based limits
use the client address established by the trusted gateway or hosting edge, not
caller-supplied forwarding values.

Sign-in remembers the session across browser restarts without a remember-me
choice, subject to session expiry and logout.

The SQL-backed user role and [document registry](../../architecture.md#document-registry) are the
authorization sources of truth. Session UI and [client metadata caches](../../architecture.md#document-registry) may expose
their results but do not authorize a request.

The client metadata runtime starts only inside the authenticated app. Login,
administration and offline surfaces render outside that runtime,
including when the surface requires an authenticated session. A browser may
cache its last validated bootstrap for offline reopen.

## Logout

Logout immediately ends local app access on one device, including offline.
Local cleanup and the server request are bounded so an unreachable server or
undeletable database cannot stall local logout. Full logout requires server
confirmation.

Logout clears the cached bootstrap and the device's local Yjs offline data.
Deleting the offline encryption key satisfies that clearing: the remaining
ciphertext is unreadable, so a database the browser refuses to drop does not
leave readable user data behind.

If this device holds edits the server has not acknowledged, logout asks
before discarding them. Acknowledged work is not prompted.

Logout attempts to revoke the server session. Until the server confirms, report
that local data is cleared and that sign-out is unfinished, and require one
explicit action to finish it. Offering sign-in satisfies that requirement when it
finishes the revocation before presenting credentials; a device that cannot reach
the server reports the wait instead of offering an action that cannot succeed.
Reconnecting or reopening the app does not retry revocation automatically or
resume the old session. The pending state
survives closing the app; Django-rendered pages may still recognize the session
until revocation or expiry. Show “You're signed out” only after confirmation.
Confirmation is shared across tabs. Signing in again supersedes an unfinished
logout: the app must not send or retry its stale revocation action.
Responses to session requests already in flight follow Django's normal cookie
handling and may clear a newer login, requiring the user to sign in again.

Signing out of one browser tab signs out every tab sharing its storage, which
stops using the local data it is losing.

## Document Access

These rules apply to each user authenticated by the server.

Every document has one owner. A document may have zero or more direct
grants; a new one has none. Its URL only locates it; ownership or a grant
authorizes access.

Only the owner can grant a document to another local user. Sharing
identifies the grantee by email; a grant is created only when that email matches
an account on the document's server. A direct grant gives that user
full document access.
Only the owner receives the document's recipient list.

Users with full document access may [rename the document](../outliner/location-header.md#document-rename). The source authorizes
each submission using the caller's current access; client metadata caches do not
authorize changes.

Django authorizes each [collaboration connection](../../architecture.md#collaboration-credentials-and-paths) using its session and trusted
browser origin. Owners and direct grantees receive full document access; other
users are denied before document content loads.

## Admin Role

Django user permissions are the authorization source of truth for
server administration. The client may expose the role for UI, but Django
authorizes every administrative request from the caller's session and
permissions.

An operator creates the initial administrator through Django's `createsuperuser`
management command. Administrators manage subsequent accounts through Django
administration.

`/admin/` is the Django administration entry route. Django staff status permits
entry; model permissions control the available administrative actions. An
authenticated staff user sees an **Admin** link in the app toolbar. Anonymous
visitors authenticate through the [shared allauth sign-in](#authenticated-app-access), preserving the
requested same-origin administration destination. Authenticated nonstaff users
are denied administration without ending their ordinary app session.

## CSRF Protection

Session cookies use `SameSite=Lax` and are HTTP-only. Django's CSRF middleware
protects session-authenticated mutation routes, including sign-in and logout.
Native forms submit Django's CSRF field; browser API requests send the token in
`X-CSRFToken`. Missing or invalid tokens
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

- Consider grant revocation when extending sharing management.
- Consider password changes when adding account self-service.
- Add audit logging and rate limiting to future public-policy changes.
- Define anonymous access and public documents.
- Define bearer-link access and its revocation, regeneration, and invalid-link behavior.
- Define a local-only no-login mode.

## References

- [OWASP access-control guidance](https://devguide.owasp.org/en/04-design/02-web-app-checklist/07-access-controls/)
- [OWASP API object authorization](https://owasp.org/API-Security/editions/2019/en/0xa1-broken-object-level-authorization/)
- [Django CSRF protection](https://docs.djangoproject.com/en/6.1/howto/csrf/)
- [W3C capability URL guidance](https://www.w3.org/TR/capability-urls/)
