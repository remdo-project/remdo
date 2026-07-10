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
  self-enrollment endpoint, which registers a *new* admin account.
- `/admin` is the single admin entry route. It renders by the caller's role: an
  admin sees the admin panel; anyone else (signed in or not) sees the
  self-enrollment form. The client learns the current user's role from the
  `/api/current-user` bootstrap; this drives rendering.
- Self-enrollment is gated by `ADMIN_SECRET` (see
  [docs/config.md](./config.md#admin-bootstrap-and-enrollment)). The secret is
  a shared gate, any secret-holder can register an admin
  account, and it works independently of the public-signup policy.
- Admin entry is discoverable by context: a signed-in admin sees an **Admin**
  link in the app toolbar, and a non-public server (closed signup, where
  bootstrapping an admin is expected) surfaces a link to `/admin` from the login
  page. A public server omits the login-page link — `/admin` is still reachable
  directly.

Future: define the `ADMIN_SECRET` rotation lifecycle — whether rotating the
secret affects existing admin accounts or only future enrollment.

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
  **public** OAuth client on that source via a server-to-server call. "Public" means
  `token_endpoint_auth_method: "none"`: the source issues no client secret: PKCE
  authenticates the token exchange instead. The returned `client_id` is cached in
  the `source_servers` table, a self-filling cache keyed by the source's origin;
  later links to the same source (by any user) reuse the cached client. Newly
  registering a source triggers one in-process auth rebuild so it becomes a live
  provider immediately, with no restart. The cached value carries a registration
  contract version, so a predecessor client is re-registered on its next link.
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
  browser, which is local to the home. (This
  topology is why Client ID Metadata Documents — which need the source to fetch
  the home's metadata URL — do not fit and were not adopted.)

## Future (source-linking & admin, deferred indefinitely)

Long-horizon directions:

- **Enrollment/policy hardening.** Audit-log + rate-limit self-enrollment and any
  public-policy change — one submission now grants a durable admin role, so it is
  not a one-off action.
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
