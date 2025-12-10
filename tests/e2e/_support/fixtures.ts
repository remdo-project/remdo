import type { ConsoleMessage, Page, Response } from '@playwright/test';
import { test as base } from '@playwright/test';

function attachGuards(page: Page) {
  const allowResponse = (response: Response) => {
    const url = response.url();
    if (url.startsWith('data:')) return true;
    if (url.includes('favicon') && response.status() === 404) return true;
    return false;
  };

  const onConsole = (message: ConsoleMessage) => {
    const type = message.type();
    if (type === 'warning' || type === 'error') {
      throw new Error(`console.${type}: ${message.text()}`);
    }
  };

  const onResponse = (response: Response) => {
    const status = response.status();
    if (status >= 400 && !allowResponse(response)) {
      throw new Error(`response ${status}: ${response.url()}`);
    }
  };

  page.on('console', onConsole);
  page.on('response', onResponse);

  return () => {
    page.off('console', onConsole);
    page.off('response', onResponse);
  };
}

export const test = base.extend({
  page: async ({ page }, apply) => {
    const detach = attachGuards(page);
    await apply(page);
    detach();
  },
});

export { expect } from '@playwright/test';
export type { Page, Locator } from '@playwright/test';
