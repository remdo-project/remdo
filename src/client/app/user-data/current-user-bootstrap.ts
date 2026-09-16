import { queryOptions } from '@tanstack/react-query';
import { hasRememberedSession, isLikelyFetchUnavailableError } from '#client/app/session/client';
import { normalizeDocumentId } from '#domain/documents/ids';
import { api, requireData } from '#platform/http/api-client';
import type { components } from '#platform/http/api-schema';
import {
  clearStoredCurrentUserBootstrap,
  readStoredCurrentUserBootstrap,
  writeStoredCurrentUserBootstrap,
} from './current-user-bootstrap-storage';

export type CurrentUserBootstrap = components['schemas']['CurrentUser'];

export function currentUserBootstrapQuery(userId: string) {
  return queryOptions({
    queryKey: [globalThis.location.origin, userId, 'current-user'],
    staleTime: 0,
    refetchOnReconnect: true,
    // The first request must run offline too, so the remembered bootstrap can
    // open an already cached document without waiting for connectivity.
    networkMode: 'always',
    queryFn: async ({ signal }): Promise<CurrentUserBootstrap> => {
      let bootstrap: CurrentUserBootstrap;
      try {
        bootstrap = requireData(await api.GET('/api/current-user', { signal }));
      } catch (error) {
        const cached = getCachedCurrentUserBootstrap();
        if (!isLikelyFetchUnavailableError(error) || !hasRememberedSession() || cached?.userId !== userId) {
          throw error;
        }
        bootstrap = cached;
      }
      signal.throwIfAborted();
      if (bootstrap.userId !== userId) {
        throw new Error('The signed-in account changed.');
      }
      writeStoredCurrentUserBootstrap(JSON.stringify(bootstrap));
      return bootstrap;
    },
  });
}

export function clearCurrentUserBootstrapCache(): void {
  clearStoredCurrentUserBootstrap();
}

export function getCachedCurrentUserBootstrap(): CurrentUserBootstrap | null {
  const rawBootstrap = readStoredCurrentUserBootstrap();
  if (!rawBootstrap) {
    return null;
  }
  try {
    const body = JSON.parse(rawBootstrap) as Partial<CurrentUserBootstrap>;
    const homeDocumentId = normalizeDocumentId(body.homeDocumentId);
    if (typeof body.userId === 'string' && body.userId && homeDocumentId) {
      return { userId: body.userId, homeDocumentId, publicServer: body.publicServer === true };
    }
  } catch {
    // Browser storage is untrusted; an invalid record cannot establish identity.
  }
  clearStoredCurrentUserBootstrap();
  return null;
}
