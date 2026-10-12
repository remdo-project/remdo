import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { Browser, BrowserContext } from 'playwright';
import type { DemoAccount } from '../lib/demo-account';
import type { OutlineNote } from './pane';
import { expectOutline } from './pane';
import { STAGE_SIZE } from './stage';

const run = promisify(execFile);

export async function signIn(browser: Browser, origin: string, account: DemoAccount): Promise<BrowserContext> {
  const context = await browser.newContext({ viewport: STAGE_SIZE, locale: 'en-US' });
  await context.addInitScript(() => {
    localStorage.setItem('remdo-dev-tooling-visible', 'false');
    document.addEventListener('DOMContentLoaded', () => {
      const style = document.createElement('style');
      style.textContent = '.dev-visibility-toggle { display: none !important; }';
      document.head.append(style);
    });
  });
  const { csrfToken } = await (await context.request.get(new URL('/api/config', origin).href, {
    failOnStatusCode: true,
  })).json() as { csrfToken: string };
  await context.request.post(new URL('/api/auth/browser/v1/auth/login', origin).href, {
    data: account,
    headers: { 'X-CSRFToken': csrfToken, Origin: origin },
    failOnStatusCode: true,
  });
  return context;
}

export async function mcpToken(email: string): Promise<string> {
  const { stdout } = await run('./tools/django.sh', ['create_delegated_token', email]);
  return stdout.trim();
}

// A fresh context has no local copy, so its outline comes from the server.
export async function confirmStoredOutline(
  browser: Browser,
  context: BrowserContext,
  documentUrl: string,
  expected: OutlineNote[],
): Promise<void> {
  const fresh = await browser.newContext({ viewport: STAGE_SIZE, storageState: await context.storageState() });
  try {
    const page = await fresh.newPage();
    await page.goto(documentUrl);
    await expectOutline(page, expected);
  } finally {
    await fresh.close();
  }
}
