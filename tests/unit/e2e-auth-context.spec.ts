import type { Browser, BrowserContext } from '@playwright/test';
import { expect, it, vi } from 'vitest';
import { createAuthenticatedContext } from '../e2e/_support/auth-context';
vi.mock('../../tools/lib/django-user', () => ({ provisionDjangoUser: async () => {} }));

it('preserves an authentication failure when context cleanup also fails', async () => {
  const authFailure = new Error('authentication failed');
  const context = {
    close: () => Promise.reject(new Error('cleanup failed')),
    request: {
      get: () => Promise.reject(authFailure),
      post: () => Promise.reject(authFailure),
    },
  } as unknown as BrowserContext;
  const browser = {
    newContext: () => Promise.resolve(context),
  } as unknown as Browser;

  await expect(createAuthenticatedContext(browser, {})).rejects.toBe(authFailure);
});
