import { accountApi, getApiConfig, requireData } from '#platform/http/api-client';

export async function getSession() {
  await getApiConfig();
  const result = await accountApi.GET('/api/auth/browser/v1/auth/session');
  // Allauth browser sessions report missing or expired sessions as 401.
  // Its 410 response applies only to app clients using session tokens.
  if (result.response.status === 401) {
    return null;
  }
  return requireData(result).data;
}

export async function signOut(signal?: AbortSignal): Promise<void> {
  await getApiConfig();
  const result = await accountApi.DELETE('/api/auth/browser/v1/auth/session', { signal });
  // Allauth acknowledges revocation with its native unauthenticated response.
  if (result.response.status === 401 && result.error && 'meta' in result.error && !result.error.meta.is_authenticated) {
    return;
  }
  requireData(result);
}
