import type { ConsoleMessage, Page, Response } from '@playwright/test';
import { test as base } from '@playwright/test';
import { ensureReady, load } from './bridge';

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

let docCounter = 0;

async function createEditorHarness(page: Page, docId: string) {
  await page.goto(`/?doc=${docId}`);
  await page.locator('.editor-input').first().waitFor();
  await ensureReady(page, { clear: true });

  const waitForSynced = () => page.evaluate(() => {
    const promise = (globalThis as typeof globalThis & { __remdoBridgePromise?: Promise<unknown> }).__remdoBridgePromise;
    return promise?.then((api) => (api as any)?.waitForSynced());
  });

  return {
    docId,
    waitForSynced,
    load: (name: string) => load(page, name),
  };
}

type EditorHarness = Awaited<ReturnType<typeof createEditorHarness>>;

export const test = base.extend<{ testDocId: string; editor: EditorHarness }>({
  page: async ({ page }, apply) => {
    const detach = attachGuards(page);
    await apply(page);
    detach();
  },
  // eslint-disable-next-line no-empty-pattern
  testDocId: async ({}, applyDocId, testInfo) => {
    const docId = `test-${testInfo.workerIndex}-${docCounter++}`;
    await applyDocId(docId);
  },
  editor: async ({ page, testDocId }, applyEditor) => {
    const editor = await createEditorHarness(page, testDocId);
    await applyEditor(editor);
    await editor.waitForSynced();
  },
});

export { expect } from '@playwright/test';
export type { Page, Locator } from '@playwright/test';
