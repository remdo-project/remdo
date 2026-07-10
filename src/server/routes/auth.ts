import { Hono } from 'hono';
import { normalizeSourceIssuer } from '#server/auth/auth';
import { decodeSourceId } from '#server/remdo-oauth/config';
import type { ServerRouteDependencies } from './types';

const SOURCE_CALLBACK_PATH_PREFIX = '/api/auth/callback/';

function getSourceCallbackIssuerError(
  request: Request,
): 'issuer_mismatch' | 'issuer_missing' | null {
  const url = new URL(request.url);
  if (!url.pathname.startsWith(SOURCE_CALLBACK_PATH_PREFIX)) {
    return null;
  }
  const providerId = url.pathname.slice(SOURCE_CALLBACK_PATH_PREFIX.length);
  if (!providerId || providerId.includes('/')) {
    return null;
  }
  const sourceOrigin = decodeSourceId(providerId);
  if (!sourceOrigin) {
    return null;
  }
  const issuer = url.searchParams.get('iss');
  if (!issuer) {
    return 'issuer_missing';
  }
  return issuer === normalizeSourceIssuer(sourceOrigin)
    ? null
    : 'issuer_mismatch';
}

export function createAuthRoutes({ auth }: ServerRouteDependencies) {
  const routes = new Hono();

  routes.all('/*', async (c) => {
    const issuerError = getSourceCallbackIssuerError(c.req.raw);
    if (issuerError) {
      const errorUrl = new URL('/api/auth/error', auth.baseURL);
      errorUrl.searchParams.set('error', issuerError);
      return c.redirect(errorUrl.toString());
    }
    await auth.ensureReady();
    return auth.auth.handler(c.req.raw);
  });

  return routes;
}
