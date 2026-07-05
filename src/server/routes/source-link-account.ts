import type { Context } from 'hono';
import { HTTP_STATUS } from '#platform/http/status';
import { REMDO_SERVER_OAUTH_SCOPES } from '#server/auth/auth';
import type { ServerRouteDependencies } from './types';

// Shared tail of both link-initiation routes (URL-first source-links and by-id
// account-links): start the OAuth link for the resolved provider, returning the
// authorize redirect. Each route resolves its own providerId (lazily-registered
// vs. already-known) and requires a signed-in actor first — the URL-first route
// checks auth before self-registering, so authorization is caller-owned here.
export async function startSourceAccountLink(
  { auth, logError }: Pick<ServerRouteDependencies, 'auth' | 'logError'>,
  c: Context,
  providerId: string,
): Promise<Response> {
  try {
    return await auth.auth.api.oAuth2LinkAccount({
      body: {
        providerId,
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
}

// A public server acts only as a source and refuses to initiate linking (see
// docs/access-model.md): this confines linking's outbound-fetch (SSRF) surface to
// private homes, whose users are the operator's own. Both link routes guard on it
// — the URL-first route and the by-id account-links route, since a source provider
// can pre-exist (a private home that linked, then flipped to public).
export function refusePublicServerLink(
  { auth }: Pick<ServerRouteDependencies, 'auth'>,
  c: Context,
): Response | null {
  if (auth.allowSignup) {
    return c.json({ error: 'A public server does not link to sources.' }, HTTP_STATUS.FORBIDDEN);
  }
  return null;
}
