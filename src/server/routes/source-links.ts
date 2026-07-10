import { Hono } from 'hono';
import { HTTP_STATUS } from '#platform/http/status';
import { normalizeToHttpOrigin } from '#platform/net/http-origin';
import { requireActorResolution } from '#server/auth/actor';
import { REMDO_SERVER_OAUTH_SCOPES } from '#server/auth/auth';
import { ensureSourceClient } from '#server/remdo-oauth/ensure-source-client';
import { SourceRegistrationError } from '#server/remdo-oauth/source-client-registration';
import type { ServerRouteDependencies } from './types';

// URL-first source linking: the only linking entry point. Any signed-in user
// links a source by URL; the home lazily ensures a public OAuth client for that
// URL (self-registering on first use), rebuilds auth so a provider exists, then
// drives the OAuth link. No admin gate, no curated source list, no ceremony.
export function createSourceLinkRoutes(dependencies: ServerRouteDependencies) {
  const { auth, database, rebuildAuth, logError } = dependencies;
  const routes = new Hono();

  routes.post('/source-links', async (c) => {
    // A public server acts only as a source and refuses to initiate linking (see
    // docs/access-model.md): this confines linking's outbound-fetch (SSRF) surface
    // to private homes, whose users are the operator's own.
    if (auth.allowSignup) {
      return c.json({ error: 'A public server does not link to sources.' }, HTTP_STATUS.FORBIDDEN);
    }
    const body: { url?: string } = await c.req.json<{ url?: string }>().catch(() => ({}));
    const raw = typeof body.url === 'string' ? body.url.trim() : '';
    // Normalize a user-pasted URL to its bare origin: a source is identified by
    // origin, so accept the browser-normal forms (a trailing slash, or a deep
    // link) by reducing to the origin rather than rejecting them.
    const origin = normalizeToHttpOrigin(raw);
    if (!origin) {
      return c.json({ error: 'A valid source server URL is required.' }, HTTP_STATUS.BAD_REQUEST);
    }

    // Authorize before self-registering: an unauthenticated request must not
    // trigger client registration on the source. Require an interactive SESSION,
    // not a delegated bearer token — linking is a home user's own action, so a
    // cross-server bearer holder must not drive the outbound registration.
    const actor = await requireActorResolution(c, auth);
    if (actor instanceof Response) {
      return actor;
    }
    if (actor.credential !== 'session') {
      return c.json({ error: 'Linking a source requires a signed-in session.' }, HTTP_STATUS.FORBIDDEN);
    }

    try {
      const { sourceId } = await ensureSourceClient({
        database,
        sourceOrigin: origin,
        homeOrigin: new URL(auth.baseURL).origin,
        scopes: REMDO_SERVER_OAUTH_SCOPES,
      });
      // Rebuild unconditionally so the source's genericOAuth provider is live in
      // this process before the link. A rebuild is synchronous, cheap, and
      // idempotent; doing it always (not only when this request registered the
      // client) closes the concurrent-first-link window where one racer cached the
      // client but another reaches OAuth before that racer's own rebuild.
      await rebuildAuth();
      return await auth.auth.api.linkSocialAccount({
        body: {
          provider: sourceId,
          callbackURL: '/sharing',
          scopes: [...REMDO_SERVER_OAUTH_SCOPES],
        },
        headers: c.req.raw.headers,
        asResponse: true,
      });
    } catch (error) {
      // A source REFUSING registration with a 4xx (private source, not a RemDo
      // server, rate limited) is an expected outcome of the user's URL, not a home
      // fault: report it as a client error, unlogged. A source 5xx is a genuine
      // upstream fault and falls through to the logged 500 below.
      if (error instanceof SourceRegistrationError && error.status < 500) {
        // Preserve a 429 (rate limited); report any other source 4xx as a 400.
        const status = error.status === HTTP_STATUS.TOO_MANY_REQUESTS
          ? HTTP_STATUS.TOO_MANY_REQUESTS
          : HTTP_STATUS.BAD_REQUEST;
        return c.json({ error: 'The source server did not accept the link.' }, status);
      }
      logError(error, {});
      return c.json({ error: 'Failed to link the source server.' }, HTTP_STATUS.INTERNAL_SERVER_ERROR);
    }
  });

  return routes;
}
