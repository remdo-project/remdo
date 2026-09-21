import { QueryClient } from '@tanstack/query-core';
import type { QueryFunctionContext } from '@tanstack/query-core';
import createClient from 'openapi-fetch';
import { apiFetch, setCsrfCookieName } from './api-fetch';
import type { paths as ApiPaths } from './api-schema';
import type { paths as AccountPaths } from './auth-schema';

const options = {
  baseUrl: typeof location === 'undefined' ? undefined : location.origin,
  fetch: (request: Request) => fetchApi(request),
};

export async function fetchApi(request: Request, beforeDispatch?: () => void): Promise<Response> {
  // Offline reopening can reach mutations before configuration has loaded.
  if (typeof document !== 'undefined' && new URL(request.url).origin === location.origin
    && !['GET', 'HEAD', 'OPTIONS'].includes(request.method)) {
    await getApiConfig();
  }
  // Identity guards must run after prerequisites, with no further await before fetch.
  beforeDispatch?.();
  return apiFetch(request);
}

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
export const apiConfiguration = {
  client: new QueryClient(),
  query: {
    queryKey: ['api-config'],
    staleTime: Infinity,
    retry: false,
    // A fresh offline load must reach the session gate's remembered-state
    // fallback instead of pausing its configuration request until reconnect.
    networkMode: 'always' as const,
    queryFn: async ({ signal }: QueryFunctionContext) => {
      const config = requireData(await api.GET('/api/config', { signal }));
      setCsrfCookieName(config.csrfCookieName);
      return config;
    },
  },
};

export function getApiConfig() {
  return apiConfiguration.client.query(apiConfiguration.query);
}
