import type { Browser, BrowserContext } from '@playwright/test';
import { expect, it } from 'vitest';
import { createAuthenticatedContext } from '../e2e/_support/auth-context';

it('preserves an authentication failure when context cleanup also fails', async () => {
  const authFailure = new Error('authentication failed');
  const context = {
    close: () => Promise.reject(new Error('cleanup failed')),
    request: {
      post: () => Promise.reject(authFailure),
    },
  } as unknown as BrowserContext;
  const browser = {
    newContext: () => Promise.resolve(context),
  } as unknown as Browser;

  await expect(createAuthenticatedContext(browser, {})).rejects.toBe(authFailure);
});
