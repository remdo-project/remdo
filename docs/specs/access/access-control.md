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
email/password authentication and, when configured, [Google
sign-in](../runtime/configuration.md#google-sign-in) and [email
sign-in](../runtime/configuration.md#email-delivery). The
[deployment account bootstrap](../runtime/configuration.md#deployment-accounts)
creates the configured accounts at startup, and operators create further
accounts through Django administration. Password signup is closed.
Creating an account also creates one empty [editor document](../outliner/note-model.md#definitions) titled **New Document**.
Account and document creation succeed together. Later account updates and reads
leave the document inventory unchanged.

Google sign-in requests account selection on every attempt. It signs in to the
account it is linked to. Otherwise it uses only
an email address Google reports as verified: it signs in to the account whose
email matches, case-insensitively, and links Google to it; that account keeps
its password. Without a match, it creates an account for that email without a
password. A staff or superuser account never signs in with Google, including an
account linked before its promotion, and its email match creates no account.
RemDo requests only basic identity and does not store Google access or refresh
tokens.

Email sign-in asks first only for an email address. An address that matches an
active account with a password continues to the email/password form with that
address filled in. That form offers a one-time code by email to the address it
holds, on request. An address that matches an active account without a password
is sent a one-time code and signs in once the code is confirmed. Any other
address gets an account without a password, which grants no access until its
code is confirmed. Signup never collects a password. A code never replaces the
password of a staff or superuser account. The outcomes are distinguishable:
[sharing](#document-sharing) already reveals whether an address has an account,
and the routing also reveals whether it has a password.

Allauth renders sign-in at `/accounts/login/` and validates credentials.
Sign-in and the public home offer **Sign in with Google**. With email sign-in,
the sign-in page offers the email form, and the refusal of a code or Google
sign-in to a staff or superuser account links to the email/password form.
Opening or submitting the sign-in page abandons an unfinished code step.
Successful sign-in returns to the requested same-origin app destination,
defaulting to Home. The app keeps an in-place signed-out screen after logout
so offline logout does not require a server-rendered page.

Production allauth sign-in retains the framework's rate limits, and the email
step that continues to the email/password form counts against the same limit as
password sign-in attempts. IP-based limits
use the client address established by the trusted gateway or hosting edge, not
caller-supplied forwarding values.

Sign-in remembers the session across browser restarts without a remember-me
choice, subject to session expiry and logout.

The server's user role and [document registry](../../architecture.md#document-registry) are the
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

Each [document](../outliner/note-model.md#definitions) owns the authorization policy for itself and the notes belonging
to it. Every note has one owning document. A document is its own owning document.
Listing or linking a note alone grants no additional authority over it and does
not change its owning document.

Exposing data or performing operations through another document requires the
source document's authorization. The receiving document controls access to that
exposure within the source's permitted data and operations. The receiving
document's users need not have direct access to the source document.

The following rules apply to each user authenticated by the server.

Every document has one owner. A document may have zero or more direct
grants; a new one has none. Its URL only locates it; ownership or a grant
authorizes access.

Only the owner can grant a document to another local user. Sharing
identifies the grantee by email; a grant is created only when that email matches
an account on the document's server. A direct grant gives that user
full document access.
Only the owner receives the document's recipient list.
A recipient also receives the document owner's email and available display name.

Users with full document access may [rename the document](../outliner/location-header.md#document-rename). The source authorizes
each submission using the caller's current access; client metadata caches do not
authorize changes.

Django authorizes each [collaboration connection](../../architecture.md#collaboration-credentials-and-paths) using its credential.
Owners and direct grantees receive full document access; other
users are denied before document content loads.

### Document sharing

The sharing surface names the document it acts on. Owners see current recipients
before the controls that change them; other users with document access see
their own access summary. Each change applies on its own, without a separate
save step. **Close** dismisses the surface, keeping access already added and
discarding an address that was not added. Closing while a grant is pending does
not cancel it; reopening shows the current recipient list.

The owner's recipient list includes **You · Owner** and labels direct grantees
**Can edit**. The grant form gives **Add access** consistent primary emphasis and
identifies a typed, unsubmitted address as not yet added. It states that the
recipient needs an account on this server and no email is sent, and reports
success or rejection against the submitted address. Success confirms that the
address has access, including repeated grants. Grants follow
[user data operations](../outliner/user-data.md#operations) and update the open recipient list on success.
Pending submission locks the email and action; failure retains the draft.

The email field shows a green border and a checkmark as a well-formed address is
typed, requiring a dotted domain except for `localhost`. Format errors appear on
blur or submission and clear when corrected. Source errors take precedence.

While typing a name or email, the grant form suggests people from current direct
sharing relationships on this server: recipients of the caller's documents and
owners of documents shared with the caller. Suggestions are deduplicated and
exclude the caller and current recipients. Outgoing or mutual connections
precede incoming-only connections, with each group ordered by display name or
email. Choosing a suggestion fills the address; **Add access** applies the grant.

**Copy link** copies the document-root URL, including when opened from a zoomed
view, and states that copying does not change access. Clipboard failure or
unavailability offers a selectable URL instead of reporting a successful copy.

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
contract.

Django enforces trusted origins supplied by the resolved [runtime configuration](../runtime/configuration.md#network-addressing).
Production trusts only that origin. Development additionally trusts local
aliases.

A server's canonical public port namespaces its session and CSRF cookies. Local
stacks on shifted port ranges keep independent sessions while sharing one
browser hostname.

## Delegated access

A signed-in user can grant a third-party application access that acts as that
user. The application requests it through the OAuth authorization-code flow with
PKCE; the user signs in and consents on RemDo. Consent and connected-app
management name the application by the host serving its client metadata,
followed by its declared name, and consent states that it can access and edit
the user's documents. Applications identify themselves only by a client metadata
document URL served over HTTPS. A registered `http` redirect URI on `localhost`,
`127.0.0.1`, or `::1` accepts any port, so native applications can receive the
grant on an ephemeral local port. Staff and superuser accounts cannot grant or use
delegated access, including a grant made before promotion.

A delegated access token authenticates as its user on the RemDo API and on
[collaboration connections](../../architecture.md#collaboration-credentials-and-paths),
under that user's current [document access](#document-access), without a
browser origin. The [MCP server](../integrations/mcp.md) accepts only tokens
with the `openid` scope and issued for it as their target resource
([RFC 8707](https://www.rfc-editor.org/rfc/rfc8707)); the API and
collaboration connections accept a token whatever its resource, so the MCP
server acts with the token it received. Account pages, sign-out,
administration, and connected-app
management accept only the browser session. Access tokens are short-lived; the
application renews them with a refresh token that each renewal replaces.

A signed-in user's **Connected apps** page lists the applications they granted
and revokes each one. Revocation ends that application's tokens at once;
established collaboration connections keep their authorization until disconnect.

## Future

- Consider offering a readable export before document deletion.
- Consider password changes when adding account self-service.
- Add audit logging and rate limiting to future public-policy changes.
- Define anonymous access and public documents.
- Define a local-only no-login mode.

## References

- [OWASP access-control guidance](https://devguide.owasp.org/en/04-design/02-web-app-checklist/07-access-controls/)
- [OWASP API object authorization](https://owasp.org/API-Security/editions/2019/en/0xa1-broken-object-level-authorization/)
- [Django CSRF protection](https://docs.djangoproject.com/en/6.1/howto/csrf/)
- [W3C capability URL guidance](https://www.w3.org/TR/capability-urls/)
