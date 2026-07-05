import { Hono } from 'hono';
import { HTTP_STATUS } from '#platform/http/status';
import { isHttpOrigin } from '#platform/net/http-origin';
import { requireActor } from '#server/auth/actor';
import { REMDO_SERVER_OAUTH_SCOPES } from '#server/auth/auth';
import { ensureSourceClient } from '#server/remdo-oauth/ensure-source-client';
import type { ServerRouteDependencies } from './types';

// URL-first source linking: the only linking entry point. Any signed-in user
// links a source by URL; the home lazily ensures a public OAuth client for that
// URL (self-registering on first use), rebuilds auth so a provider exists, then
// drives the OAuth link. No admin gate, no curated source list, no ceremony.
//
// A public server acts only as a SOURCE, never as a linking home: it refuses to
// initiate linking. This confines the outbound-fetch (SSRF) surface of linking to
// private/self-hosted homes, whose users are the operator's own — see
// docs/access-model.md.
export function createSourceLinkRoutes({
  auth,
  database,
  rebuildAuth,
  logError,
}: ServerRouteDependencies) {
  const routes = new Hono();

  routes.post('/source-links', async (c) => {
    if (auth.allowSignup) {
      return c.json({ error: 'A public server does not link to sources.' }, HTTP_STATUS.FORBIDDEN);
    }
    const body: { url?: string } = await c.req.json<{ url?: string }>().catch(() => ({}));
    const url = typeof body.url === 'string' ? body.url.trim() : '';
    if (!isHttpOrigin(url)) {
      return c.json({ error: 'A valid source server URL is required.' }, HTTP_STATUS.BAD_REQUEST);
    }

    const actor = await requireActor(c, auth);
    if (actor instanceof Response) {
      return actor;
    }

    try {
      const { sourceId, created } = await ensureSourceClient({
        database,
        url,
        homeOrigin: new URL(auth.baseURL).origin,
        scopes: REMDO_SERVER_OAUTH_SCOPES,
      });
      if (created) {
        rebuildAuth();
      }
      return auth.auth.api.oAuth2LinkAccount({
        body: {
          providerId: sourceId,
          callbackURL: '/sharing',
          scopes: [...REMDO_SERVER_OAUTH_SCOPES],
        },
        headers: c.req.raw.headers,
        asResponse: true,
      });
    } catch (error) {
      logError(error, {});
      return c.json({ error: 'Failed to link the source server.' }, HTTP_STATUS.INTERNAL_SERVER_ERROR);
    }
  });

  return routes;
}
