import { expect, readOutline, test as base } from '#e2e/fixtures';
import type { Locator, Page } from '#e2e/fixtures';
import type { BrowserContext } from '@playwright/test';
import { cleanupCollabDoc, createTestRuntimeScope } from '#tests-common/runtime-scope';
import { createUserDocument } from '../../_support/documents';
import { createAuthenticatedContext } from '../../_support/auth-context';
import { waitForSynced } from './bridge';
import {
  captureCreatedEditorDoc,
  createEditorHarness,
} from './runtime';

type EditorHarness = Awaited<ReturnType<typeof createEditorHarness>>;

async function cleanupUserDataCollabDocs(context: BrowserContext): Promise<void> {
  const response = await context.request.get('/api/me');
  if (!response.ok()) {
    return;
  }

  const bootstrap = await response.json() as Partial<{
    userDataDocumentId: string;
    homeDocumentId: string;
  }>;
  await Promise.all(
    [bootstrap.userDataDocumentId, bootstrap.homeDocumentId]
      .filter((docId): docId is string => typeof docId === 'string' && docId.length > 0)
      .map((docId) => cleanupCollabDoc(docId)),
  );
}

export const test = base.extend<
  {
    editor: EditorHarness;
    allocateEditorDocId: () => string;
    captureCreatedDoc: (page: Page, createDoc: () => Promise<void>) => Promise<string>;
    newEditorContext: () => Promise<BrowserContext>;
  }
>({
  context: async ({ browser, contextOptions }, applyFixture) => {
    const context = await createAuthenticatedContext(browser, contextOptions);
    try {
      await applyFixture(context);
    } finally {
      await cleanupUserDataCollabDocs(context);
      await context.close();
    }
  },
  // eslint-disable-next-line no-empty-pattern -- Playwright fixture callbacks require object destructuring for dependency discovery.
  allocateEditorDocId: async ({}, applyFixture) => {
    const runtimeScope = createTestRuntimeScope();
    await applyFixture(() => runtimeScope.allocateDocId());
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
  newEditorContext: async ({ browser, context, contextOptions }, applyFixture) => {
    await applyFixture(async () => browser.newContext({
      ...contextOptions,
      storageState: await context.storageState(),
    }));
  },
  editor: async ({ page }, applyFixture) => {
    const document = await createUserDocument(page, `Editor ${Date.now()}`);
    try {
      const editor = await createEditorHarness(page, document.id);
      await applyFixture(editor);
      await waitForSynced(page);
    } finally {
      await cleanupCollabDoc(document.id);
    }
  },
});

export { expect, readOutline };
export type { Page, Locator };
