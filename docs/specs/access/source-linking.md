# Source Linking

Source linking presents documents from another RemDo server without merging
the servers' user identities. The server that owns each document remains the
authority for its account, access, and collaboration credentials.

## Server Roles

A **source server** owns its documents, authenticates its users, stores local
[document grants](access-control.md#document-access), and issues
[Y-Sweet document client tokens](../../architecture.md#token-vocabulary).

A **home server** stores the user's
[OAuth account tokens](../../architecture.md#token-vocabulary) for linked
sources and presents source documents alongside its local documents. Home and
source accounts are independent identities; their email addresses do not need
to match.

A server with public signup accepts source-client registration and acts only as
a source. It does not initiate source linking. A home is private, and its users
are within the operator's trust boundary. The home does not need to be
internet-reachable: server-to-server requests travel from home to source, while
OAuth redirects travel through the user's browser.

This role split confines the home's outbound source-registration requests to
operator-trusted users.

This topology excludes Client ID Metadata Documents because the source would
need to fetch a metadata URL from the private home.

## Cross-Server Source Linking

A linked source OAuth token delegates the linking user's full source account to
the home. The home can call authenticated RemDo APIs as that source user. The
source applies its own [Document Access](access-control.md#document-access)
rules to those calls just as it does to the user's source session. The
delegation does not grant one source user access belonging to another.

Document sharing continues to target a local account on the document's source
server. Once linked, the browser subscribes to the source-owned
[user-data projection](../../architecture.md#document-registry) and merges its
documents into the home document list.

## Linking a Source

Source linking accepts an HTTP or HTTPS URL entered on the Sharing page and
reduces it to its origin. Only a signed-in home session can initiate linking; a
bearer-authenticated caller cannot.

On the first link to an origin, the home registers a public OAuth client on the
source. The client has no secret and uses PKCE. The source's authorization and
token endpoints accept only the home's exact registered callback URI.
Registration becomes usable without restarting the home. Later links to the
same origin reuse the cached client across home users.

The source accepts unauthenticated dynamic client registration only while it is
public. The client alone grants no document access: the source user signs in and
consents before Better Auth stores the linked account on the home.

When a cached client predates the current registration contract, the home
registers a replacement. Because refresh tokens are client-bound, linked
accounts using the predecessor are invalidated and their users relink.

## Known Security Boundary

Outbound registration does not follow redirects. Only a private home's signed-in
user can initiate the request to the supplied source origin.

An unauthenticated caller cannot distinguish a cached source from an unknown
one. On `/api/current-user/source-servers/:serverId/*`, a signed-in user receives
403 for a cached but unlinked source and 404 for an unknown source. Source IDs
derive from origins, so the distinction requires knowing the origin and reveals
no user or document data.

## Future

- Reject non-loopback HTTP sources during source derivation so source-issuer
  normalization can be removed, after Docker E2E can expose its source over
  loopback.
- Add destination-IP validation to outbound registration while preserving
  private-IP and loopback sources in development. The current exposure is
  limited to a private home's own signed-in users.
- Return the same response for known but unlinked and unknown sources if the
  source-existence distinction becomes material.
- Decide whether a server changing from private to public sheds existing home
  links and projected source documents; the public-source guard currently
  applies only when linking starts.

## References

- [Better Auth OAuth/OIDC provider](https://better-auth.com/docs/plugins/oauth-provider)
- [Better Auth generic OAuth](https://better-auth.com/docs/plugins/generic-oauth)
