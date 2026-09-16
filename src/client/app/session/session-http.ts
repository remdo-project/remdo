import { accountApi, ApiError, getApiConfig, requireData } from '#platform/http/api-client';
import type { components } from '#platform/http/auth-schema';

export async function getSession() {
  await getApiConfig();
  const result = await accountApi.GET('/api/auth/browser/v1/auth/session');
  if (result.response.status === 401) {
    return null;
  }
  return requireData(result).data;
}

export async function signIn(credentials: components['schemas']['Login']) {
  await getApiConfig();
  const result = await accountApi.POST('/api/auth/browser/v1/auth/login', { body: credentials });
  if (result.response.status === 409 && await getSession()) {
    return;
  }
  if (result.error) {
    const message = 'errors' in result.error ? result.error.errors?.[0]?.message : undefined;
    throw new ApiError(result.response.status, message ?? 'Failed to sign in.');
  }
  requireData(result);
}

export async function signOut(): Promise<void> {
  await getApiConfig();
  const result = await accountApi.DELETE('/api/auth/browser/v1/auth/session');
  // Allauth acknowledges revocation with its native unauthenticated response.
  if (result.response.status === 401 && result.error && 'meta' in result.error && !result.error.meta.is_authenticated) {
    return;
  }
  requireData(result);
}
