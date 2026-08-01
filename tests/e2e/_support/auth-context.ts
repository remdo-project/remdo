import type { Browser, BrowserContext, BrowserContextOptions } from '@playwright/test';
import { config } from '#config';
import { HTTP_STATUS } from '#platform/http/status';
import { resolveAppOrigin } from '#platform/net/origins';
import { createTestAuthAccount } from '#tests-common/auth-account';

interface AuthAccount {
  email: string;
  name: string;
  password: string;
}

export async function createAuthenticatedContext(
  browser: Browser,
  contextOptions: BrowserContextOptions,
  account: AuthAccount = createTestAuthAccount(),
): Promise<BrowserContext> {
  const context = await browser.newContext(contextOptions);
  const appOrigin = resolveAppOrigin({ loopback: true });

  try {
    // Authentication is harness control-plane setup, not behavior under test.
    // Recover one ECONNRESET; a second exposes a persistent stack failure. Reuse
    // the account so an enrollment committed before the reset can sign in below.
    let response = await context.request.post(
      new URL('/api/admin/enroll', appOrigin).href,
      {
        data: {
          ...account,
          adminSecret: config.env.ADMIN_SECRET,
        },
        maxRetries: 1,
      },
    );
    if (response.status() === HTTP_STATUS.UNPROCESSABLE_ENTITY) {
      const signInResponse = await context.request.post(
        new URL('/api/auth/sign-in/email', appOrigin).href,
        {
          data: {
            email: account.email,
            password: account.password,
          },
          maxRetries: 1,
        },
      );
      if (signInResponse.ok()) {
        response = signInResponse;
      }
    }
    if (!response.ok()) {
      throw new Error(`Failed to authenticate e2e user: ${response.status()} ${response.statusText()}`);
    }
    return context;
  } catch (error) {
    try {
      await context.close();
    } catch {
      // Preserve the authentication failure that made cleanup necessary.
    }
    throw error;
  }
}
