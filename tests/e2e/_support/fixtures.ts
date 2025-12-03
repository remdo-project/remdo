import type { Page } from '@playwright/test';
import { expect, test as base } from '@playwright/test';

function attachGuards(page: Page) {
  const issues: string[] = [];

  page.on('console', (message) => {
    const type = message.type();
    if (type === 'warning' || type === 'error') {
      issues.push(`console.${type}: ${message.text()}`);
    }
  });

  page.on('response', (response) => {
    const status = response.status();
    if (status >= 400 && !response.url().startsWith('data:')) {
      issues.push(`response ${status}: ${response.url()}`);
    }
  });

  return {
    verify() {
      expect(issues).toEqual([]);
    },
  };
}

export const test = base.extend({
  page: async ({ page }, apply) => {
    const guard = attachGuards(page);
    await apply(page);
    guard.verify();
  },
});

export { expect } from '@playwright/test';

export async function waitForAppReady(page: Page, docId = 'playwright-e2e') {
  await page.goto(`/?doc=${docId}`);
  await page.getByRole('heading', { name: 'RemDo' }).waitFor();
  await page.locator('.editor-input').first().waitFor();
}
