import type { Browser, BrowserContext, BrowserContextOptions } from '@playwright/test';
import { config } from '#config';
import { resolveAppOrigin } from '#platform/net/origins';
import { createTestAuthAccount } from '#tests-common/auth-account';

export async function createAuthenticatedContext(
  browser: Browser,
  contextOptions: BrowserContextOptions,
): Promise<BrowserContext> {
  const context = await browser.newContext(contextOptions);

  try {
    const response = await context.request.post(
      new URL('/api/admin/enroll', resolveAppOrigin({ loopback: true })).href,
      {
        data: {
          ...createTestAuthAccount(),
          adminSecret: config.env.ADMIN_SECRET,
        },
      },
    );
    if (!response.ok()) {
      throw new Error(`Failed to provision e2e user: ${response.status()} ${response.statusText()}`);
    }
    return context;
  } catch (error) {
    await context.close();
    throw error;
  }
}
