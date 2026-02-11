import fs from 'node:fs/promises';
import path from 'node:path';
import { setExpectedConsoleIssues, expect, readOutline, test as base } from '#e2e/fixtures';
import type { Locator, Page } from '#e2e/fixtures';
import { config } from '#config';
import { createNoteId } from '#lib/editor/note-ids';
import { ensureReady, getEditorState, load, waitForSynced } from './bridge';
import { prepareEditorTestSurface } from './focus';
import { editorLocator } from './locators';

type EditorHarness = Awaited<ReturnType<typeof createEditorHarness>>;
interface EditorLoadOptions {
  expectedConsoleIssues?: string[];
}

async function removeCollabDocFromDisk(docId: string): Promise<void> {
  const docPath = path.join(config.env.DATA_DIR, 'collab', docId);
  await fs.rm(docPath, { recursive: true, force: true });
}

async function createEditorHarness(page: Page, docId: string) {
  await removeCollabDocFromDisk(docId);
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
  testDocId: async ({}, use) => {
    const docId = createNoteId();
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
export type { Page, Locator };
