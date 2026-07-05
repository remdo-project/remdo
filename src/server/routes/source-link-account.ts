import type { Context } from 'hono';
import { HTTP_STATUS } from '#platform/http/status';
import { REMDO_SERVER_OAUTH_SCOPES } from '#server/auth/auth';
import type { ServerRouteDependencies } from './types';

// Shared by both link-initiation routes (URL-first source-links and by-id
// account-links): builds the OAuth link request for the resolved provider,
// returning the authorize redirect. Each route resolves its own providerId
// (lazily-registered vs. already-known), authorizes the actor first (the
// URL-first route before self-registering), and owns the surrounding try/catch —
// so a rejection here is caught by the caller's single link-error boundary.
export function startSourceAccountLink(
  { auth }: Pick<ServerRouteDependencies, 'auth'>,
  c: Context,
  providerId: string,
): Promise<Response> {
  return auth.auth.api.oAuth2LinkAccount({
    body: {
      providerId,
      callbackURL: '/sharing',
      scopes: [...REMDO_SERVER_OAUTH_SCOPES],
    },
    headers: c.req.raw.headers,
    asResponse: true,
  });
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
