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
