import { Hono } from 'hono';
import { config } from '#config';
import { HTTP_STATUS } from '#platform/http/status';
import { isHttpOrigin } from '#platform/net/http-origin';
import { resolveActor } from '#server/auth/actor';
import { resolveAdminSessionUserId } from '#server/auth/admin-auth';
import { REMDO_SERVER_OAUTH_SCOPES } from '#server/auth/auth';
import { listSourceServers, setSourceServerCredentials } from '#server/remdo-oauth/source-server-store';
import type { ServerRouteDependencies } from './types';

// Cross-server home-registration flow (docs/access-model.md#registering-a-home-on-a-source).
// The home registers itself as an OAuth client on a source during a source
// user's authenticated session on the source, WITHOUT the source ever fetching a
// home-supplied URL (which would be SSRF / a credential-exfiltration vector):
//
//   home POST /source-servers/:id/register (home admin) -> issue handle, redirect
//     to source GET /register-home (top-level nav carries the source cookie)
//   source registers in-process under the source user's session, stashes the
//     issued credentials under a one-time code, redirects the browser back to the
//     home with that code (no secret in the URL, no source-side outbound fetch)
//   home POST /source-servers/:id/claim (home admin) -> pulls the credentials
//     from ITS OWN configured source URL with the code, persists, rebuilds auth.

export function createLinkRoutes({
  auth,
  database,
  rebuildAuth,
  registrationCodes,
  registrationHandles,
  logError,
}: ServerRouteDependencies) {
  const routes = new Hono();

  async function findConfiguredSource(id: string) {
    const servers = await listSourceServers(database);
    return servers.find((candidate) => candidate.id === id) ?? null;
  }

  // HOME. An admin starts registering this home on a configured source. Returns
  // the source URL to navigate to (top-level, so the admin's source cookie rides
  // along under SameSite=Lax). The target is the source's confirmation PAGE, not
  // a server route — the actual registration is a deliberate POST the source user
  // makes there, so it cannot be triggered by a cross-site navigation.
  routes.post('/source-servers/:id/register', async (c) => {
    if (!(await resolveAdminSessionUserId(auth, c.req.raw.headers))) {
      return c.json({ error: 'Admin role required.' }, HTTP_STATUS.FORBIDDEN);
    }
    const server = await findConfiguredSource(c.req.param('id'));
    if (!server) {
      return c.json({ error: 'Source server not found.' }, HTTP_STATUS.NOT_FOUND);
    }

    const handle = registrationHandles.issue(server.id);
    const redirectUrl = new URL(`${server.baseUrl}/oauth/register-home`);
    redirectUrl.searchParams.set('handle', handle);
    redirectUrl.searchParams.set('home', new URL(config.env.AUTH_URL).origin);
    // The home's own id for this source, echoed back unchanged so the home knows
    // which source row the returning admin is completing (the source must not
    // re-derive it — the home and source may know the source by different origins).
    redirectUrl.searchParams.set('state', server.id);
    return c.json({ redirectUrl: redirectUrl.toString() });
  });

  // SOURCE. Registers an OAuth client for a home, bound to the signed-in source
  // account, and returns the home URL to send the browser back to with a one-time
  // claim code. This is a POST made deliberately from the source's confirmation
  // page (CSRF-protected, same-origin JSON) — it is not reachable by cross-site
  // navigation. The source performs no outbound request to the home, so a hostile
  // `home` value cannot exfiltrate the secret or drive an SSRF. Any signed-in
  // source user may register a home; source-admin rights are not required.
  routes.post('/register-home', async (c) => {
    const body: { handle?: string; home?: string; state?: string } = await c.req.json().catch(() => ({}));
    const { handle, home: homeOrigin, state: homeSourceId } = body;
    // homeSourceId is the home's derived source id (base64url); it goes into the
    // registered redirect_uri path, so require that shape rather than letting a
    // malformed value reach the OAuth client registration.
    if (!handle || !homeOrigin || !isHttpOrigin(homeOrigin) || !homeSourceId || !/^[\w-]+$/u.test(homeSourceId)) {
      return c.json({ error: 'Invalid registration request.' }, HTTP_STATUS.BAD_REQUEST);
    }

    await auth.ensureReady();
    const actor = await resolveActor(c.req.raw, auth);
    if (!actor) {
      return c.json({ error: 'Authentication required.' }, HTTP_STATUS.UNAUTHORIZED);
    }
    // Only a public source accepts home registration; report the policy as a
    // clean 403 rather than letting the registration call fail as a 500.
    if (!auth.allowSignup) {
      return c.json({ error: 'This server does not accept home registration.' }, HTTP_STATUS.FORBIDDEN);
    }

    let code: string;
    try {
      const registration = await auth.auth.api.registerOAuthClient({
        body: {
          client_name: `RemDo home ${homeOrigin}`,
          redirect_uris: [`${homeOrigin}/api/auth/oauth2/callback/${homeSourceId}`],
          grant_types: ['authorization_code', 'refresh_token'],
          response_types: ['code'],
          token_endpoint_auth_method: 'client_secret_basic',
          scope: REMDO_SERVER_OAUTH_SCOPES.join(' '),
        },
        headers: c.req.raw.headers,
      });
      code = registrationCodes.issue({
        clientId: registration.client_id,
        clientSecret: registration.client_secret ?? '',
      });
    } catch (error) {
      logError(error, {});
      // Forward an expected client-side rejection (e.g. the register rate limit)
      // as its own 4xx; only an unexpected error is a 500.
      const status = (error as { statusCode?: unknown }).statusCode;
      if (typeof status === 'number' && status >= 400 && status < 500) {
        return c.json({ error: 'Source rejected the registration.' }, status as 400);
      }
      return c.json({ error: 'Failed to register the home client.' }, HTTP_STATUS.INTERNAL_SERVER_ERROR);
    }

    const done = new URL(`${homeOrigin}/admin`);
    done.searchParams.set('sourceId', homeSourceId);
    done.searchParams.set('handle', handle);
    done.searchParams.set('code', code);
    return c.json({ redirectUrl: done.toString() });
  });

  // SOURCE. The home pulls the credentials it was issued, with the one-time code.
  // Server-to-server; the code is the authorization. Single-use.
  routes.post('/claim-registration', async (c) => {
    // Only a public source ever issues codes, so this endpoint has no purpose on
    // a non-public server; refuse outright rather than leaving it reachable.
    if (!auth.allowSignup) {
      return c.json({ error: 'This server does not accept home registration.' }, HTTP_STATUS.FORBIDDEN);
    }
    const body: { code?: string } = await c.req.json().catch(() => ({}));
    if (typeof body.code !== 'string' || !body.code) {
      return c.json({ error: 'A registration code is required.' }, HTTP_STATUS.BAD_REQUEST);
    }
    const credentials = registrationCodes.claim(body.code);
    if (!credentials) {
      return c.json({ error: 'Unknown or expired registration code.' }, HTTP_STATUS.FORBIDDEN);
    }
    return c.json(credentials);
  });

  // HOME. Completes registration: validates the handle it issued, pulls the
  // credentials from ITS OWN configured source URL (never a request-supplied
  // host), persists them, and rebuilds auth so the source is linkable at once.
  routes.post('/source-servers/:id/claim', async (c) => {
    if (!(await resolveAdminSessionUserId(auth, c.req.raw.headers))) {
      return c.json({ error: 'Admin role required.' }, HTTP_STATUS.FORBIDDEN);
    }
    const body: { handle?: string; code?: string } = await c.req.json().catch(() => ({}));
    const sourceId = c.req.param('id');
    // Verify (but don't yet consume) the handle, so a recoverable failure below
    // leaves it usable for a retry; it is consumed only once creds are persisted.
    if (typeof body.handle !== 'string' || !registrationHandles.verify(body.handle, sourceId)) {
      return c.json({ error: 'Unknown or expired registration handle.' }, HTTP_STATUS.FORBIDDEN);
    }
    if (typeof body.code !== 'string' || !body.code) {
      return c.json({ error: 'A registration code is required.' }, HTTP_STATUS.BAD_REQUEST);
    }
    const server = await findConfiguredSource(sourceId);
    if (!server) {
      return c.json({ error: 'Source server not found.' }, HTTP_STATUS.NOT_FOUND);
    }

    try {
      const response = await fetch(`${server.baseUrl}/api/link/claim-registration`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ code: body.code }),
      });
      if (!response.ok) {
        return c.json({ error: 'Source rejected the registration claim.' }, HTTP_STATUS.BAD_REQUEST);
      }
      const credentials = await response.json() as { clientId?: string; clientSecret?: string };
      if (!credentials.clientId || !credentials.clientSecret) {
        return c.json({ error: 'Source returned no credentials.' }, HTTP_STATUS.BAD_REQUEST);
      }
      await setSourceServerCredentials(database, sourceId, {
        clientId: credentials.clientId,
        clientSecret: credentials.clientSecret,
      });
      registrationHandles.consume(body.handle, sourceId);
      rebuildAuth();
      return c.json({ ok: true });
    } catch (error) {
      logError(error, {});
      return c.json({ error: 'Failed to claim source registration.' }, HTTP_STATUS.INTERNAL_SERVER_ERROR);
    }
  });

  return routes;
}
