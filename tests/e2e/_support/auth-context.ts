import type { Browser, BrowserContext, BrowserContextOptions } from '@playwright/test';
import { resolveLocalGatewayOrigin } from '#platform/net/origins';
import { createTestAuthAccount } from '#tests-common/auth-account';
import { authenticateDjangoTestUser } from '#tests-common/django-auth';
import { provisionDjangoUser } from '../../../tools/lib/django-user';

type AuthAccount = Record<keyof ReturnType<typeof createTestAuthAccount>, string>;

export async function createAuthenticatedContext(
  browser: Browser,
  contextOptions: BrowserContextOptions,
  account: AuthAccount = createTestAuthAccount(),
): Promise<BrowserContext> {
  await provisionDjangoUser({ ...account, admin: true });
  const context = await browser.newContext(contextOptions);
  const appOrigin = resolveLocalGatewayOrigin();
  try {
    const csrfToken = await authenticateDjangoTestUser(context.request, appOrigin, account);
    await context.setExtraHTTPHeaders({ 'X-CSRFToken': csrfToken });
    return context;
  } catch (error) {
    try {
      await context.close();
    } catch {
      // Preserve the original authentication failure.
    }
    throw error;
  }
}
