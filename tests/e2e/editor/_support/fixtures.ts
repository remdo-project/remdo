import { expect, test as base } from '../../_support/fixtures';
import type { Locator, Page } from '../../_support/fixtures';
import { ensureReady, load } from '../../_support/bridge';
import { prepareEditorTestSurface } from './focus';
import { editorLocator } from './locators';

let docCounter = 0;

type EditorHarness = Awaited<ReturnType<typeof createEditorHarness>>;

async function createEditorHarness(page: Page, docId: string) {
  await page.goto(`/?doc=${docId}`);
  await editorLocator(page).locator('.editor-input').first().waitFor();
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

export const test = base.extend<{ testDocId: string; editor: EditorHarness }>({
  // eslint-disable-next-line no-empty-pattern
  testDocId: async ({}, use, testInfo) => {
    const docId = `test-${testInfo.workerIndex}-${docCounter++}`;
    await use(docId);
  },
  editor: async ({ page, testDocId }, use) => {
    await prepareEditorTestSurface(page);
    const editor = await createEditorHarness(page, testDocId);
    await use(editor);
    await editor.waitForSynced();
  },
});

export { expect };
export type { Page, Locator, EditorHarness };
