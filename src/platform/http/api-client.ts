import { QueryClient } from '@tanstack/query-core';
import createClient from 'openapi-fetch';
import { apiFetch, setCsrfCookieName } from './api-fetch';
import type { paths as ApiPaths } from './api-schema';
import type { paths as AccountPaths } from './auth-schema';

const options = {
  baseUrl: typeof location === 'undefined' ? undefined : location.origin,
  fetch: async (request: Request) => {
    // This shared boundary owns CSRF configuration for same-origin mutations.
    if (typeof document !== 'undefined' && new URL(request.url).origin === location.origin
      && !['GET', 'HEAD', 'OPTIONS'].includes(request.method)) {
      await getApiConfig();
    }
    return apiFetch(request);
  },
};

export const api = createClient<ApiPaths>(options);
export const accountApi = createClient<AccountPaths>(options);

export class ApiError extends Error {
  constructor(readonly status: number, message = `Request failed: ${status}`) {
    super(message);
    this.name = 'ApiError';
  }
}

export function requireData<T>({ data, response }: { data?: T; response: Response }): T {
  if (!response.ok || data === undefined) {
    throw new ApiError(response.status);
  }
  return data;
}

// Public deployment configuration has a different lifetime from account data.
const configuration = new QueryClient();

export function getApiConfig() {
  return configuration.query({
    queryKey: ['api-config'],
    staleTime: Infinity,
    retry: false,
    // Surface an offline configuration failure instead of pausing until reconnect.
    networkMode: 'always',
    queryFn: async ({ signal }) => {
      const config = requireData(await api.GET('/api/config', { signal }));
      setCsrfCookieName(config.csrfCookieName);
      return config;
    },
  });
}
