# Source Linking

Source linking lets one user account work across RemDo servers. At the document
sharing level, sharing still targets a local account on the document's server.

## Cross-Server Source Linking

- Source server: owns documents, authenticates its users, stores local document
  grants, and issues Y-Sweet document client tokens.
- Home server: stores the user's OAuth account tokens for linked source
  accounts.
- Source linking: the home server starts OAuth, the user signs in on the source
  server, and Better Auth stores the resulting linked account. Home and source
  accounts are independent identities; their email addresses need not match.
- Delegation scope: a linked source OAuth token is treated as the
  linking user's full delegate on that source server. The home server may call
  authenticated RemDo APIs as that source user, subject to the same owner/grant
  checks the source server applies to the user's normal session. This is an
  account-delegation model, not a cross-user grant.
- Source documents: once linked, the browser can subscribe to source-owned user
  data projections and merge those documents into the same document list.

### Linking a source

Linking is **URL-first and user-driven**: any signed-in user links a source by
entering its URL on the Sharing page ("Link source").

- On the **first** link to a new source URL, the home lazily self-registers a
  **public** OAuth client on that source via a server-to-server call. "Public"
  means `token_endpoint_auth_method: "none"`: the source issues no client secret:
  PKCE authenticates the token exchange instead. The returned `client_id` is
  cached in the `source_servers` table, a self-filling cache keyed by the source's
  origin; later links to the same source (by any user) reuse the cached client.
  Newly registering a source triggers one in-process auth rebuild so it becomes
  a live provider immediately, with no restart. The cached value carries a
  registration contract version, so a predecessor client is re-registered on
  its next link; predecessor account links are invalidated because their refresh
  tokens are client-bound, and each affected user relinks explicitly.
- Phishing resistance is **structural**, enforced by the source: its OAuth
  authorize and token endpoints require the `redirect_uri` to exactly match the
  client's registered `redirect_uris`. A public, redirect-locked client grants no
  document access on its own — only a source user authenticating and consenting
  does.
- A source accepts registration only while it is acting as a **public** source
  (open-signup): it enables unauthenticated dynamic client registration
  (`allowUnauthenticatedClientRegistration`), gated on the same public/signup
  setting, because the home's self-registration call carries no source session.
- **A public server acts only as a source, never as a linking home.** A public
  server's users are outside the operator's trust boundary, so this confines
  linking's outbound-fetch surface to private homes, whose users are the
  operator's own.
- **Homes may be private / not internet-reachable.** Every server-to-server call
  goes home→source, and the OAuth redirect travels through the user's own
  browser, which is local to the home. (This topology is why Client ID Metadata
  Documents — which need the source to fetch the home's metadata URL — do not
  fit and were not adopted.)

## Future

- **Reject non-loopback http sources** at add time (in `deriveSourceServer`), so
  every stored origin is one Better Auth's issuer normalization leaves alone and
  the `normalizeSourceIssuer` mirror can be deleted. Blocked on the Docker E2E,
  whose source is `http://<host-IP>` (rootless Docker can't reach a loopback
  source) — the real work is making that source loopback-reachable.
- **Destination-IP validation on the outbound registration fetch (defense in
  depth).** URL-first linking makes the home POST to a user-supplied origin
  (`registerPublicSourceClient` → `<url>/api/auth/oauth2/register`). The dangerous
  case is already closed by construction: the public-server guard means only a
  *private* home reaches this path (403 on public servers), a session (not bearer)
  is required, and `redirect: 'error'` blocks a bounce. The residual is a private
  home's own signed-in user driving it at their own network — the operator's own
  infrastructure, a non-threat. For defense in depth, add a resolve-then-check
  destination-IP allowlist that permits loopback/RFC1918 only in dev (must not
  break the private-IP/loopback source topology or the Docker E2E's
  `http://<host-IP>` source).
- **Source-existence side-channel (accepted residual).** A signed-in user can
  distinguish a known-but-not-linked source (403) from an unknown one (404) on
  `/source-servers/:id/*`, and ids derive from origins — so they can detect that
  *some* user linked an origin they already know. Bounded (needs the origin up
  front; reveals no other user/doc data). Close by returning 404 for
  known-but-unlinked if it ever matters.
- **Public server shedding its home role.** The source-only policy is enforced
  only at link *initiation*. A server flipped private→public that already holds
  linked sources still serves them (the source proxies + `/api/current-user`
  projection keep working). Decide whether a public server should fully shed its
  home role (guard the shared source-access + projection path, hide existing
  source docs) or accept it — a policy call to take with the `ALLOW_SIGNUP`
  runtime-toggle work, not a per-route patch.

## References

- [Better Auth OAuth/OIDC provider](https://better-auth.com/docs/plugins/oauth-provider)
  supports the source-server authorization role.
- [Better Auth generic OAuth](https://better-auth.com/docs/plugins/generic-oauth)
  supports configured OAuth client providers for the home-server role.
