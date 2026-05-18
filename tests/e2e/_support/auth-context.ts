import { request } from '@playwright/test';
import type { Browser, BrowserContext, BrowserContextOptions } from '@playwright/test';
import { config } from '#config';
import { resolveLoopbackHost } from '#lib/net/loopback';
import { createTestAuthAccount } from '#tests-common/auth-account';

export async function createAuthenticatedContext(
  browser: Browser,
  contextOptions: BrowserContextOptions,
): Promise<BrowserContext> {
  const requestHost = resolveLoopbackHost(config.env.HOST);
  const apiContext = await request.newContext({
    baseURL: `http://${requestHost}:${config.env.REMDO_API_PORT}`,
  });

  try {
    const response = await apiContext.post('/api/admin/users', {
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
