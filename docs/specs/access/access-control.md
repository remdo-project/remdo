# Access Control

Access control combines authenticated identity, administrative authority, and
document ownership or grants. These boundaries determine which app state and
collaborative document state a user can access.

## Access Scope

User-facing document access is authenticated by a session, or a
[delegated access](#delegated-access) token, on the server that owns the
document.
RemDo does not expose anonymous documents, public documents, document-access
links carrying bearer credentials, or a local-only no-login mode.

## Authenticated App Access

A Django session identifies the signed-in user. The server supports
email/password authentication and, when
[configured](../runtime/configuration.md#google-sign-in), Google sign-in. The
[deployment account bootstrap](../runtime/configuration.md#deployment-accounts)
creates the configured accounts at startup, and operators create further
accounts through Django administration. Email/password signup is closed.
Creating an account also creates one empty document titled **New Document**.
Account and document creation succeed together. Later account updates and reads
leave the document inventory unchanged.

Google sign-in signs in to the account it is linked to. Otherwise it uses only
an email address Google reports as verified: it signs in to the account whose
email matches, case-insensitively, and links Google to it; that account keeps
its password. Without a match, it creates an account for that email without a
password. A staff or superuser account never signs in with Google, including an
account linked before its promotion, and its email match creates no account.
RemDo requests only basic identity and does not store Google access or refresh
tokens.

Allauth renders sign-in at `/accounts/login/` and validates credentials.
Sign-in and the public home offer **Sign in with Google**. Successful sign-in
returns to the requested same-origin app destination, defaulting to Home. The
app keeps an in-place signed-out screen after logout so offline logout does not
require a server-rendered page.

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

Users start logout from a sign-out confirmation. Logout immediately ends local
app access on one device, including offline.
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

### Document sharing

An owner manages one document's access from that document's [quick action menu](../outliner/menu.md).
The surface names the document it acts on and presents current recipients
before the controls that change them. Each change applies on its own; the
surface has no combined submission and closes without discarding applied
changes.

Granting takes an email address and reports a rejected address against the
address it was given. A grant appears among the recipients once the source
accepts it, without reopening the surface.

### Document deletion

Only the owner can delete a document, from that document's [quick action menu](../outliner/menu.md),
after a confirmation that names the document and states that deletion cannot
be undone. Deletion removes the document for every user; RemDo keeps no trash or
restore path. Deleting a document that is already
gone succeeds. An owner may delete their last document.

An open session of a deleted document discards edits the server has not
acknowledged, without asking, and leaves for [Home](../outliner/home.md) with a notice that
the document was deleted. A device discards its local copy of a deleted document
once the server reports the document gone.

## Admin Role

Django user permissions are the authorization source of truth for
server administration. The client may expose the role for UI, but Django
authorizes every administrative request from the caller's session and
permissions.

The [deployment account bootstrap](../runtime/configuration.md#deployment-accounts)
creates the initial administrator. Administrators manage subsequent accounts
through Django administration.

`/admin/` is the Django administration entry route. Django staff status permits
entry; model permissions control the available administrative actions. An
authenticated staff user sees an **Admin** link in the
[page header](../../architecture.md#shared-presentation). Anonymous
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
contract; [delegated access](#delegated-access) is that contract, and its bearer
requests carry no ambient credential for CSRF protection to guard.

Django enforces trusted origins supplied by the resolved [runtime configuration](../runtime/configuration.md#network-addressing).
Production trusts only that origin. Development additionally trusts local
aliases.

A server's canonical public port namespaces its session and CSRF cookies. Local
stacks on shifted port ranges keep independent sessions while sharing one
browser hostname.

## Delegated access

A signed-in user can grant a third-party application access that acts as that
user. The application requests it through the OAuth authorization-code flow with
PKCE; the user signs in and consents on RemDo. Consent names the application as
its client metadata identifies it and states that it can access and edit the
user's documents. Applications identify themselves only by a client metadata
document URL served over HTTPS. Staff and superuser accounts cannot grant
delegated access.

A delegated access token authenticates as its user on the RemDo API and on
[collaboration connections](../../architecture.md#collaboration-credentials-and-paths),
under that user's current [document access](#document-access), without a
browser origin. Account pages, sign-out, administration, and connected-app
management accept only the browser session. Access tokens are short-lived; the
application renews them with a refresh token that each renewal replaces.

A signed-in user's **Connected apps** page lists the applications they granted
and revokes each one. Revocation ends that application's tokens at once: later
API requests and collaboration connections are denied, and established
connections keep their authorization until disconnect.

## Future

- Consider grant revocation when extending sharing management.
- Consider offering a readable export before document deletion.
- Consider password changes when adding account self-service.
- Add audit logging and rate limiting to future public-policy changes.
- Define anonymous access and public documents.
- Define bearer-link access and its revocation, regeneration, and invalid-link behavior.
- Define a local-only no-login mode.
- Consider narrower delegated-access scopes or per-document grants.

## References

- [OWASP access-control guidance](https://devguide.owasp.org/en/04-design/02-web-app-checklist/07-access-controls/)
- [OWASP API object authorization](https://owasp.org/API-Security/editions/2019/en/0xa1-broken-object-level-authorization/)
- [Django CSRF protection](https://docs.djangoproject.com/en/6.1/howto/csrf/)
- [W3C capability URL guidance](https://www.w3.org/TR/capability-urls/)
