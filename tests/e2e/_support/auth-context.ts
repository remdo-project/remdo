import { request } from '@playwright/test';
import type { Browser, BrowserContext, BrowserContextOptions } from '@playwright/test';
import { config } from '#config';
import { resolveAppOrigin } from '#platform/net/origins';
import { createTestAuthAccount } from '#tests-common/auth-account';

export async function createAuthenticatedContext(
  browser: Browser,
  contextOptions: BrowserContextOptions,
): Promise<BrowserContext> {
  const apiContext = await request.newContext({
    baseURL: resolveAppOrigin({ loopback: true }),
  });

  try {
    const response = await apiContext.post('/api/admin/enroll', {
      data: {
        ...createTestAuthAccount(),
        adminSecret: config.env.ADMIN_SECRET,
      },
    });
    if (!response.ok()) {
      throw new Error(`Failed to provision e2e user: ${response.status()} ${response.statusText()}`);
    }
    return browser.newContext({
      ...contextOptions,
      storageState: await apiContext.storageState(),
    });
  } finally {
    await apiContext.dispose();
  }
}
