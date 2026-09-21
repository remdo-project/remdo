import type { APIRequestContext } from '@playwright/test';
import { expect, it } from 'vitest';
import { resolveApiServerOrigin } from '#platform/net/origins';
import { TEST_AUTH_ACCOUNT } from '#tests-common/auth-account';
import { authenticateDjangoTestUser } from '#tests-common/django-auth';
import { withTestAuthentication } from './collab/_support/auth';

it('reports a failed allauth sign-in', async () => {
  const request = {
    get: async () => ({ json: async () => ({ csrfToken: 'before-login' }) }),
    post: async () => ({ ok: () => false, status: () => 400, statusText: () => 'Bad Request' }),
  } as unknown as APIRequestContext;

  await expect(authenticateDjangoTestUser(request, resolveApiServerOrigin(), TEST_AUTH_ACCOUNT)).rejects.toThrow(
    'Failed to authenticate test user: sign-in 400 Bad Request',
  );
});

it('uses the rotated CSRF token independently of cookie names', () => {
  const request = withTestAuthentication('/api/documents', { method: 'POST', body: '{}' }, {
    cookie: 'session=authenticated; renamed_csrf_cookie=cookie-value',
    csrfToken: 'rotated-masked-token',
  });

  expect(request.headers.get('cookie')).toBe('session=authenticated; renamed_csrf_cookie=cookie-value');
  expect(request.headers.get('X-CSRFToken')).toBe('rotated-masked-token');
});

it.each([
  'https://another-source.example/api/documents',
  `${resolveApiServerOrigin()}/d/document/auth`,
])('does not send fixture credentials outside the local API: %s', (url) => {
  const request = withTestAuthentication(url, undefined, {
    cookie: 'session=authenticated',
    csrfToken: 'token',
  });

  expect(request.headers.has('cookie')).toBe(false);
  expect(request.headers.has('X-CSRFToken')).toBe(false);
});
