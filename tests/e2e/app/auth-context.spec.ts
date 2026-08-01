import { expect, guardedTest as test } from '#e2e/fixtures';
import type { Browser, BrowserContext } from '@playwright/test';
import { createTestAuthAccount } from '#tests-common/auth-account';
import { createAuthenticatedContext } from '../_support/auth-context';

test('authenticates a context when its test account already exists', async ({
  browser,
  contextOptions,
}) => {
  const account = createTestAuthAccount();
  const firstContext = await createAuthenticatedContext(browser, contextOptions, account);
  await firstContext.close();

  const secondContext = await createAuthenticatedContext(browser, contextOptions, account);
  try {
    const bootstrapResponse = await secondContext.request.get('/api/current-user');
    expect(bootstrapResponse.ok()).toBe(true);
  } finally {
    await secondContext.close();
  }
});

test('reports the enrollment failure when an existing account cannot sign in', async ({
  browser,
  contextOptions,
}) => {
  const account = createTestAuthAccount();
  const firstContext = await createAuthenticatedContext(browser, contextOptions, account);
  await firstContext.close();

  await expect(createAuthenticatedContext(browser, contextOptions, {
    ...account,
    password: `${account.password}-wrong`,
  })).rejects.toThrow('422 Unprocessable Entity');
});

test('preserves an authentication failure when context cleanup also fails', async () => {
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
