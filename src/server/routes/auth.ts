import { Hono } from 'hono';
import { normalizeSourceIssuer } from '#server/auth/auth';
import { decodeSourceId } from '#server/remdo-oauth/config';
import type { ServerRouteDependencies } from './types';

function getSourceCallbackIssuerError(
  providerId: string,
  issuer: string | undefined,
): 'issuer_mismatch' | 'issuer_missing' | null {
  const sourceOrigin = decodeSourceId(providerId);
  if (!sourceOrigin) {
    return null;
  }
  if (!issuer) {
    return 'issuer_missing';
  }
  return issuer === normalizeSourceIssuer(sourceOrigin)
    ? null
    : 'issuer_mismatch';
}

export function createAuthRoutes({ auth }: ServerRouteDependencies) {
  const routes = new Hono();

  routes.use('/callback/:providerId', async (c, next) => {
    const issuerError = getSourceCallbackIssuerError(
      c.req.param('providerId'),
      c.req.query('iss'),
    );
    if (issuerError) {
      const errorUrl = new URL('/api/auth/error', auth.baseURL);
      errorUrl.searchParams.set('error', issuerError);
      return c.redirect(errorUrl.toString());
    }
    await next();
  });

  routes.all('/*', async (c) => {
    await auth.ensureReady();
    return auth.auth.handler(c.req.raw);
  });

  return routes;
}
