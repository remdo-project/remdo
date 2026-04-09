import { expect, readOutline, test as base } from '#e2e/fixtures';
import type { Locator, Page } from '#e2e/fixtures';
import type { BrowserContext } from '@playwright/test';
import { cleanupCollabDoc, createTestRuntimeScope } from '#tests-common/runtime-scope';
import { waitForSynced } from './bridge';
import {
  bindEditorRuntimeContext,
  captureCreatedEditorDoc,
  createIsolatedEditorContext,
  createEditorHarness,
} from './runtime';

type EditorHarness = Awaited<ReturnType<typeof createEditorHarness>>;

export const test = base.extend<
  {
    editor: EditorHarness;
    allocateEditorDocId: () => string;
    captureCreatedDoc: (page: Page, createDoc: () => Promise<void>) => Promise<string>;
    editorUserConfigDocId: string;
    newEditorContext: () => Promise<BrowserContext>;
  }
>({
  // eslint-disable-next-line no-empty-pattern -- Playwright fixture callbacks require object destructuring for dependency discovery.
  editorUserConfigDocId: async ({}, applyFixture) => {
    const runtimeScope = createTestRuntimeScope();
    const docId = runtimeScope.allocateDocId('user-config');
    await applyFixture(docId);
    await runtimeScope.cleanupOwnedDocs();
  },
  context: async ({ context, editorUserConfigDocId }, applyFixture) => {
    await bindEditorRuntimeContext(context, editorUserConfigDocId);
    await applyFixture(context);
  },
  // eslint-disable-next-line no-empty-pattern -- Playwright fixture callbacks require object destructuring for dependency discovery.
  allocateEditorDocId: async ({}, applyFixture) => {
    const runtimeScope = createTestRuntimeScope();
    await applyFixture(() => runtimeScope.allocateDocId('editor'));
    await runtimeScope.cleanupOwnedDocs();
  },
  // eslint-disable-next-line no-empty-pattern -- Playwright fixture callbacks require object destructuring for dependency discovery.
  captureCreatedDoc: async ({}, applyFixture) => {
    const ownedDocIds = new Set<string>();
    const trackDocId = (docId: string) => {
      ownedDocIds.add(docId);
    };
    await applyFixture((page, createDoc) => captureCreatedEditorDoc(page, createDoc, trackDocId));
    await Promise.all(Array.from(ownedDocIds, (docId) => cleanupCollabDoc(docId)));
  },
  newEditorContext: async ({ browser, editorUserConfigDocId }, applyFixture) => {
    await applyFixture(() => createIsolatedEditorContext(browser, editorUserConfigDocId));
  },
  editor: async ({ page, allocateEditorDocId }, applyFixture) => {
    const editor = await createEditorHarness(page, allocateEditorDocId());
    await applyFixture(editor);
    await waitForSynced(page);
  },
});

export { expect, readOutline };
export type { Page, Locator };
