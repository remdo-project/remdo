import type { Page } from '@playwright/test';
import { expect, test as base } from '@playwright/test';
import { ensureReady, load } from './bridge';

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

let docCounter = 0;

export interface EditorHarness {
  docId: string;
  waitForSynced: () => Promise<void>;
  load: (name: string) => Promise<void>;
}

async function createEditorHarness(page: Page, docId: string): Promise<EditorHarness> {
  await page.goto(`/?doc=${docId}`);
  await page.getByRole('heading', { name: 'RemDo' }).waitFor();
  await page.locator('.editor-input').first().waitFor();
  await ensureReady(page, { clear: true });

  const waitForSynced = () => page.evaluate(() => {
    const api = (globalThis as typeof globalThis & { remdoTest?: { waitForSynced: () => Promise<void> } }).remdoTest;
    return api?.waitForSynced();
  });

  return {
    docId,
    waitForSynced,
    load: (name: string) => load(page, name),
  };
}

export const test = base.extend<{ testDocId: string; editor: EditorHarness }>({
  page: async ({ page }, apply) => {
    const guard = attachGuards(page);
    await apply(page);
    guard.verify();
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
