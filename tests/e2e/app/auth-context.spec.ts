import { expect, guardedTest as test } from '#e2e/fixtures';
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

test('reports both failures when an existing account cannot sign in', async ({
  browser,
  contextOptions,
}) => {
  const account = createTestAuthAccount();
  const firstContext = await createAuthenticatedContext(browser, contextOptions, account);
  await firstContext.close();

  await expect(createAuthenticatedContext(browser, contextOptions, {
    ...account,
    password: `${account.password}-wrong`,
  })).rejects.toThrow(/enrollment 422 .*; sign-in 401 /u);
});
