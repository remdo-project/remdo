import { setExpectedConsoleIssues, expect, readOutline, test as base } from '#e2e/fixtures';
import type { Locator, Page } from '#e2e/fixtures';
import { ensureReady, getEditorState, load, waitForSynced } from './bridge';
import { prepareEditorTestSurface } from './focus';
import { editorLocator } from './locators';

let docCounter = 0;

type EditorHarness = Awaited<ReturnType<typeof createEditorHarness>>;
interface EditorLoadOptions {
  expectedConsoleIssues?: string[];
}

async function createEditorHarness(page: Page, docId: string) {
  await page.goto(`/n/${docId}`);
  await editorLocator(page).locator('.editor-input').first().waitFor();
  await ensureReady(page, { clear: true });

  return {
    docId,
    load: (name: string, options?: EditorLoadOptions) => {
      const expectedCodes = options?.expectedConsoleIssues;
      if (expectedCodes?.length) {
        setExpectedConsoleIssues(page, expectedCodes);
      }
      return load(page, name);
    },
    getEditorState: () => getEditorState(page),
  };
}

export const test = base.extend<{ testDocId: string; editor: EditorHarness }>({
  // eslint-disable-next-line no-empty-pattern
  testDocId: async ({}, use, testInfo) => {
    const docId = `test-${testInfo.workerIndex}-${docCounter++}`;
    await use(docId);
  },
  editor: async ({ page, testDocId }, use) => {
    const editor = await createEditorHarness(page, testDocId);
    await prepareEditorTestSurface(page);
    await use(editor);
    await waitForSynced(page);
  },
});

export { expect, readOutline };
export type { Page, Locator, EditorHarness };
