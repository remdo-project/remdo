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

test('reports sign-in failure for an existing account', async ({
  browser,
  contextOptions,
}) => {
  const account = createTestAuthAccount();
  const firstContext = await createAuthenticatedContext(browser, contextOptions, account);
  await firstContext.close();

  await expect(createAuthenticatedContext(browser, contextOptions, {
    ...account,
    password: `${account.password}-wrong`,
  })).rejects.toThrow(/sign-in 400 /u);
});
