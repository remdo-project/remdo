import type { APIRequestContext } from '@playwright/test';
import type { components } from '#platform/http/api-schema';

export async function authenticateDjangoTestUser(
  request: APIRequestContext,
  appOrigin: string,
  account: { email: string; password: string },
): Promise<string> {
  const configUrl = new URL('/api/config', appOrigin).href;
  const beforeLogin = await request.get(configUrl, { failOnStatusCode: true });
  const { csrfToken } = await beforeLogin.json() as components['schemas']['Config'];
  const response = await request.post(new URL('/api/auth/browser/v1/auth/login', appOrigin).href, {
    data: { email: account.email, password: account.password },
    headers: { 'X-CSRFToken': csrfToken },
  });
  if (!response.ok()) {
    throw new Error(`Failed to authenticate test user: sign-in ${response.status()} ${response.statusText()}`);
  }
  const afterLogin = await request.get(configUrl, { failOnStatusCode: true });
  const signedIn = await afterLogin.json() as components['schemas']['Config'];
  return signedIn.csrfToken;
}
