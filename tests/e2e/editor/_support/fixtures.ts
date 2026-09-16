import { expect, test as base } from '#e2e/fixtures';
import type { Locator, Page } from '#e2e/fixtures';
import type { BrowserContext } from '@playwright/test';
import { createAuthenticatedContext } from '../../_support/auth-context';
import { createUniqueNoteId } from '#domain/notes/ids';
import { createUserDocument } from '../../_support/documents';
import {
  captureCreatedEditorDoc,
  createEditorHarness,
} from './runtime';

type EditorHarness = Awaited<ReturnType<typeof createEditorHarness>>;

export const isolatedTest = base.extend<
  {
    editor: EditorHarness;
    allocateEditorDocId: () => string;
    captureCreatedDoc: (page: Page, createDoc: () => Promise<void>) => Promise<string>;
    newEditorContext: () => Promise<BrowserContext>;
  }
>({
  // eslint-disable-next-line no-empty-pattern -- Playwright fixture callbacks require object destructuring for dependency discovery.
  allocateEditorDocId: async ({}, applyFixture) => {
    await applyFixture(createUniqueNoteId);
  },
  // eslint-disable-next-line no-empty-pattern -- Playwright fixture callbacks require object destructuring for dependency discovery.
  captureCreatedDoc: async ({}, applyFixture) => {
    await applyFixture(captureCreatedEditorDoc);
  },
  newEditorContext: async ({ browser, context, contextOptions }, applyFixture) => {
    await applyFixture(async () => browser.newContext({
      ...contextOptions,
      storageState: await context.storageState(),
    }));
  },
  editor: async ({ page }, applyFixture) => {
    const document = await createUserDocument(page, `Editor ${Date.now()}`);
    const editor = await createEditorHarness(page, document.id);
    await applyFixture(editor);
  },
});

// Account-wide UI tests use isolatedTest; ordinary editor tests only share the
// login cookies. Every test still gets a new context and its own documents.
export const test = isolatedTest.extend<Record<never, never>, {
  workerStorageState: Awaited<ReturnType<BrowserContext['storageState']>>;
}>({
  workerStorageState: [async ({ browser }, applyFixture) => {
    const context = await createAuthenticatedContext(browser, {});
    try {
      await applyFixture(await context.storageState());
    } finally {
      await context.close();
    }
  }, { scope: 'worker' }],
  context: async ({ browser, contextOptions, workerStorageState }, applyFixture) => {
    const context = await browser.newContext({ ...contextOptions, storageState: workerStorageState });
    try {
      await applyFixture(context);
    } finally {
      await context.close();
    }
  },
});

export { expect };
export type { Page, Locator };
